import { StatusCodes } from "http-status-codes";
import { ObjectId } from "mongodb";
import { GET_CLIENT } from "~/config/mongodb";
import { orderModel } from "~/models/orderModel";
import { refundRequestModel } from "~/models/refundRequestModel";
import { userModel } from "~/models/userModel";
import { CloudinaryProvider } from "~/providers/CloudinaryProvider";
import ApiError from "~/utils/ApiError";
import { sendMail } from "~/utils/sendMail";
import {
  getRefundApprovedTemplate,
  getRefundRejectedTemplate,
  getRefundCompletedTemplate,
} from "~/templates/emailTemplates";

const REFUND_WINDOW_MS = 24 * 60 * 60 * 1000;

const ensureRefundableOrder = (order) => {
  if (!order) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Không tìm thấy đơn hàng");
  }

  if (order.status !== "delivered") {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Chỉ hỗ trợ hoàn tiền cho đơn hàng đã giao thành công",
    );
  }

  if (!order.deliveredAt) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Không xác định được thời điểm giao hàng",
    );
  }

  const deliveredAt = new Date(order.deliveredAt).getTime();
  const now = Date.now();
  if (Number.isNaN(deliveredAt) || now - deliveredAt > REFUND_WINDOW_MS) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Đơn hàng đã quá thời hạn 24 giờ để yêu cầu hoàn tiền",
    );
  }
};

// chuẩn hóa danh sách sản phẩm yêu cầu hoàn tiền và tính toán tổng số tiền cần hoàn
const buildRefundItems = (order, requestedItems = []) => {
  const orderItems = order.items || [];
  if (!Array.isArray(requestedItems) || requestedItems.length === 0) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Vui lòng chọn ít nhất một sản phẩm để hoàn tiền",
    );
  }

  const orderItemMap = new Map(
    orderItems.map((item) => [String(item.productId), item]),
  );

  const normalizedItems = requestedItems
    .map((item) => ({
      productId: String(item.productId || "").trim(),
      quantity: Math.max(1, Number(item.quantity || 0)),
    }))
    .filter((item) => item.productId);

  if (normalizedItems.length === 0) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Danh sách sản phẩm hoàn không hợp lệ",
    );
  }

  let isFullRefund = true;

  const refundItems = normalizedItems.map((item) => {
    const orderItem = orderItemMap.get(item.productId);
    if (!orderItem) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "Sản phẩm yêu cầu hoàn không thuộc đơn hàng",
      );
    }

    const maxQty = Number(orderItem.quantity || 0);
    if (item.quantity > maxQty) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        `Số lượng hoàn vượt quá số lượng đã mua của sản phẩm ${orderItem.title}`,
      );
    }

    if (item.quantity < maxQty) {
      isFullRefund = false;
    }

    const price = Math.max(0, Number(orderItem.price || 0));
    return {
      productId: item.productId,
      quantity: item.quantity,
      price,
    };
  });

  // Kiểm tra xem có chọn đủ tất cả sản phẩm không
  if (refundItems.length < orderItems.length) {
    isFullRefund = false;
  }

  // Tính tổng tiền hàng được yêu cầu trả
  const itemsAmount = refundItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  let amount = 0;
  if (isFullRefund) {
    // Nếu hoàn toàn bộ đơn hàng -> Hoàn đúng tổng tiền khách đã thanh toán (bao gồm ship, đã trừ voucher)
    amount = order.totalPrice;
  } else {
    // Nếu hoàn một phần:
    // + Tiền hàng trả (KHÔNG cộng tiền ship)

    amount = itemsAmount;

    // Đảm bảo không vượt quá tổng tiền thực tế khách đã trả
    if (amount > order.totalPrice) {
      amount = order.totalPrice;
    }
  }

  return { refundItems, amount };
};

const parseJsonField = (value, fallback = null) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
};

const uploadRefundEvidenceFiles = async (files = []) => {
  const uploads = await Promise.all(
    files.map(async (file) => {
      const result = await CloudinaryProvider.streamUpload(
        file.buffer,
        "smartfood-refund-requests",
        file.mimetype,
      );

      return {
        url: result.secure_url,
        mimetype: file.mimetype,
      };
    }),
  );

  return uploads.reduce(
    (acc, file) => {
      if (file.mimetype.startsWith("image/")) {
        acc.images.push(file.url);
      } else if (file.mimetype.startsWith("video/")) {
        acc.videos.push(file.url);
      }
      return acc;
    },
    { images: [], videos: [] },
  );
};

const createRefundRequest = async (userId, payload, files = []) => {
  try {
    const {
      orderId,
      reason,
      refundMethod = "bank_transfer",
    } = payload || {};

    const parsedItems = parseJsonField(payload?.items, []);
    const parsedBankInfo = parseJsonField(payload?.bankInfo, null);
    const parsedVideos = parseJsonField(payload?.videos, []);
    const parsedImages = parseJsonField(payload?.images, []);

    if (!orderId) {
      throw new ApiError(StatusCodes.BAD_REQUEST, "Thiếu mã đơn hàng");
    }

    if (!Array.isArray(files) || files.length === 0) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "Vui lòng cung cấp ít nhất một hình ảnh minh chứng",
      );
    }

    const order = await orderModel.findByIdAndUserId(orderId, userId);
    ensureRefundableOrder(order);

    const existingRequest =
      await refundRequestModel.findLatestByOrderIdAndUserId(orderId, userId);

    if (
      existingRequest &&
      existingRequest.status !==
        refundRequestModel.REFUND_REQUEST_STATUSES.REJECTED &&
      existingRequest.status !==
        refundRequestModel.REFUND_REQUEST_STATUSES.COMPLETED
    ) {
      throw new ApiError(
        StatusCodes.CONFLICT,
        "Đơn hàng này đã có yêu cầu hoàn tiền đang được xử lý",
      );
    }

    const { refundItems, amount } = buildRefundItems(order, parsedItems);
    const evidence = await uploadRefundEvidenceFiles(files);

    const normalizedRefundMethod = ["bank_transfer", "cash_on_pickup"].includes(
      refundMethod,
    )
      ? refundMethod
      : "bank_transfer";

    const refundPayload = {
      orderId,
      userId,
      items: refundItems,
      reason: String(reason || "").trim(),
      images: [...(Array.isArray(parsedImages) ? parsedImages : []), ...evidence.images],
      videos: [...(Array.isArray(parsedVideos) ? parsedVideos : []), ...evidence.videos],
      amount,
      refundMethod: normalizedRefundMethod,
      bankInfo: normalizedRefundMethod === "bank_transfer" ? parsedBankInfo : null,
    };

    if (!refundPayload.reason) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "Vui lòng cung cấp lý do hoàn tiền",
      );
    }

    const result = await refundRequestModel.createNew(refundPayload);
    return {
      _id: result.insertedId.toString(),
      status: refundRequestModel.REFUND_REQUEST_STATUSES.PENDING,
    };
  } catch (error) {
    throw error;
  }
};

const getRefundRequestByOrder = async (userId, orderId) => {
  try {
    const refundRequest = await refundRequestModel.findLatestByOrderIdAndUserId(
      orderId,
      userId,
    );
    return refundRequest;
  } catch (error) {
    throw error;
  }
};

const submitBankInfo = async (userId, requestId, payload) => {
  try {
    const refundRequest = await refundRequestModel.findByIdAndUserId(
      requestId,
      userId,
    );
    if (!refundRequest) {
      throw new ApiError(
        StatusCodes.NOT_FOUND,
        "Không tìm thấy yêu cầu hoàn tiền",
      );
    }

    if (refundRequest.refundMethod !== "bank_transfer") {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "Yêu cầu hoàn tiền không sử dụng phương thức chuyển khoản",
      );
    }

    if (
      refundRequest.status ===
        refundRequestModel.REFUND_REQUEST_STATUSES.REJECTED ||
      refundRequest.status ===
        refundRequestModel.REFUND_REQUEST_STATUSES.COMPLETED
    ) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "Yêu cầu hoàn tiền đã kết thúc",
      );
    }

    const bankName = String(payload?.bankName || "").trim();
    const accountNumber = String(payload?.accountNumber || "").trim();
    const accountHolder = String(payload?.accountHolder || "").trim();

    if (!bankName || !accountNumber || !accountHolder) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "Vui lòng cung cấp đầy đủ thông tin ngân hàng",
      );
    }

    const updated = await refundRequestModel.updateById(requestId, {
      bankInfo: { bankName, accountNumber, accountHolder },
    });

    return updated.value;
  } catch (error) {
    throw error;
  }
};

const approveRefundRequest = async (requestId) => {
  try {
    const refundRequest = await refundRequestModel.findById(requestId);
    if (!refundRequest) {
      throw new ApiError(
        StatusCodes.NOT_FOUND,
        "Không tìm thấy yêu cầu hoàn tiền",
      );
    }

    if (
      refundRequest.status !==
      refundRequestModel.REFUND_REQUEST_STATUSES.PENDING
    ) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "Chỉ có thể duyệt yêu cầu đang ở trạng thái chờ xử lý",
      );
    }

    const isCashOnPickup = refundRequest.refundMethod === "cash_on_pickup";
    // bank_transfer: chuyển thẳng sang processing_refund (thông tin ngân hàng đã được nhập lúc tạo yêu cầu)
    // cash_on_pickup: chuyển sang approved_waiting_pickup (shipper đến lấy hàng & trả tiền mặt)
    const newStatus = isCashOnPickup
      ? refundRequestModel.REFUND_REQUEST_STATUSES.APPROVED_WAITING_PICKUP
      : refundRequestModel.REFUND_REQUEST_STATUSES.PROCESSING_REFUND;

    const updated = await refundRequestModel.updateById(requestId, {
      status: newStatus,
      rejectReason: "",
    });

    const user = await userModel.findOneById(refundRequest.userId.toString());
    if (user?.email) {
      const emailHtml = getRefundApprovedTemplate({
        orderId: refundRequest.orderId?.toString() || "",
        amount: refundRequest.amount || 0,
        refundMethod: refundRequest.refundMethod || "bank_transfer",
      });
      sendMail(
        user.email,
        "SmartFood: Yêu cầu hoàn tiền đã được duyệt",
        emailHtml,
      ).catch((err) => console.error("Lỗi gửi email duyệt hoàn tiền:", err));
    }

    return updated.value;
  } catch (error) {
    throw error;
  }
};

const rejectRefundRequest = async (requestId, reason) => {
  try {
    const refundRequest = await refundRequestModel.findById(requestId);
    if (!refundRequest) {
      throw new ApiError(
        StatusCodes.NOT_FOUND,
        "Không tìm thấy yêu cầu hoàn tiền",
      );
    }

    if (
      refundRequest.status !==
      refundRequestModel.REFUND_REQUEST_STATUSES.PENDING
    ) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "Chỉ có thể từ chối yêu cầu đang ở trạng thái chờ xử lý",
      );
    }

    const rejectReason = String(reason || "").trim();
    if (!rejectReason) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "Vui lòng cung cấp lý do từ chối",
      );
    }

    const updated = await refundRequestModel.updateById(requestId, {
      status: refundRequestModel.REFUND_REQUEST_STATUSES.REJECTED,
      rejectReason,
    });

    const user = await userModel.findOneById(refundRequest.userId.toString());
    if (user?.email) {
      const emailHtml = getRefundRejectedTemplate({
        orderId: refundRequest.orderId?.toString() || "",
        reason: rejectReason,
      });
      sendMail(
        user.email,
        "SmartFood: Yêu cầu hoàn tiền bị từ chối",
        emailHtml,
      ).catch((err) => console.error("Lỗi gửi email từ chối hoàn tiền:", err));
    }

    return updated.value;
  } catch (error) {
    throw error;
  }
};

const completeRefundRequest = async (requestId, payload) => {
  const session = GET_CLIENT().startSession();
  try {
    session.startTransaction();

    const refundRequest = await refundRequestModel.findById(requestId);
    if (!refundRequest) {
      throw new ApiError(
        StatusCodes.NOT_FOUND,
        "Không tìm thấy yêu cầu hoàn tiền",
      );
    }

    const completableStatuses = [
      refundRequestModel.REFUND_REQUEST_STATUSES.PROCESSING_REFUND,
      refundRequestModel.REFUND_REQUEST_STATUSES.APPROVED_WAITING_PICKUP,
    ];

    if (!completableStatuses.includes(refundRequest.status)) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "Yêu cầu hoàn tiền chưa sẵn sàng để hoàn tất",
      );
    }

    const isCashOnPickup = refundRequest.refundMethod === "cash_on_pickup";
    const transactionImage = String(payload?.transactionImage || "").trim();

    // Chỉ bắt buộc ảnh minh chứng cho luồng chuyển khoản ngân hàng
    if (!isCashOnPickup && !transactionImage) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "Vui lòng cung cấp hình ảnh minh chứng chuyển khoản thành công",
      );
    }

    await orderModel.updateStatusById(
      refundRequest.orderId.toString(),
      "returned",
      { session },
    );

    const updateData = {
      status: refundRequestModel.REFUND_REQUEST_STATUSES.COMPLETED,
    };
    if (transactionImage) {
      updateData.transactionImage = transactionImage;
    }

    const updatedRefund = await refundRequestModel.updateById(
      requestId,
      updateData,
      { session },
    );

    const updatedValue = updatedRefund?.value;

    await session.commitTransaction();

    if (updatedValue) {
      const user = await userModel.findOneById(updatedValue.userId.toString());
      if (user?.email) {
        const emailHtml = getRefundCompletedTemplate({
          orderId: updatedValue.orderId?.toString() || "",
          amount: updatedValue.amount || 0,
          transactionImage: updatedValue.transactionImage || "",
          refundMethod: updatedValue.refundMethod || "bank_transfer",
        });
        sendMail(
          user.email,
          "SmartFood: Hoàn tiền thành công",
          emailHtml,
        ).catch((err) =>
          console.error("Lỗi gửi email hoàn tiền thành công:", err),
        );
      }
    }

    return updatedValue;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};

const buildAdminRefundListItem = (refundRequest) => {
  const id = refundRequest?._id?.toString() || "";
  const orderId = refundRequest?.orderId?.toString() || "";
  const userId = refundRequest?.userId?.toString() || "";
  const customerName =
    refundRequest?.order?.userInfo?.fullname ||
    refundRequest?.user?.displayName ||
    "";

  return {
    id,
    orderId,
    userId,
    customerName,
    refundMethod: refundRequest?.refundMethod,
    amount: refundRequest?.amount || 0,
    status: refundRequest?.status,
    createdAt: refundRequest?.createdAt,
    updatedAt: refundRequest?.updatedAt || null,
  };
};

const buildRefundItemsWithNames = (refundRequest) => {
  const orderItems = Array.isArray(refundRequest?.orderItems)
    ? refundRequest.orderItems
    : [];
  const productMap = new Map(
    orderItems.map((item) => [item.productId?.toString(), item.title]),
  );

  return (refundRequest?.items || []).map((item) => ({
    productId: String(item.productId || ""),
    productName: productMap.get(String(item.productId || "")) || "Sản phẩm",
    quantity: item.quantity,
    price: item.price,
  }));
};

const getAdminRefundRequests = async ({
  page = 1,
  perPage = 10,
  keyword = "",
  status = "",
  refundMethod = "",
  sortField = "createdAt",
  sortOrder = "desc",
} = {}) => {
  try {
    const match = {};
    if (status && status !== "all") {
      match.status = status;
    }
    if (refundMethod && refundMethod !== "all") {
      match.refundMethod = refundMethod;
    }

    const keywordQuery = {};
    const kw = String(keyword || "").trim();
    if (kw) {
      const orConditions = [];
      if (ObjectId.isValid(kw)) {
        const objectId = new ObjectId(kw);
        orConditions.push({ _id: objectId }, { orderId: objectId });
      }

      const isNumber = /^\d+$/.test(kw);
      if (isNumber) {
        orConditions.push({ "order.orderCode": Number(kw) });
      }

      orConditions.push(
        { "order.userInfo.fullname": { $regex: kw, $options: "i" } },
        { "user.displayName": { $regex: kw, $options: "i" } },
        { "user.phone": { $regex: kw, $options: "i" } },
      );

      keywordQuery.$or = orConditions;
    }

    const sort = { [sortField]: sortOrder === "asc" ? 1 : -1 };
    const skip = (page - 1) * perPage;

    const [requests, total, summaryRows] = await Promise.all([
      refundRequestModel.getAdminRefundRequests({
        match,
        keywordQuery: keywordQuery.$or ? keywordQuery : null,
        sort,
        skip,
        limit: perPage,
      }),
      refundRequestModel.countAdminRefundRequests({
        match,
        keywordQuery: keywordQuery.$or ? keywordQuery : null,
      }),
      refundRequestModel.getAdminRefundSummary(),
    ]);

    const summary = {
      pending: 0,
      approved_waiting_pickup: 0,
      processing_refund: 0,
      completed: 0,
      rejected: 0,
      totalAmount: 0,
    };

    summaryRows.forEach((row) => {
      if (row?._id && summary[row._id] !== undefined) {
        summary[row._id] = row.count || 0;
      }
      if (row?.totalAmount) {
        summary.totalAmount += row.totalAmount;
      }
    });

    return {
      data: requests.map(buildAdminRefundListItem),
      pagination: {
        page: Number(page),
        perPage: Number(perPage),
        total,
        totalPages: Math.ceil(total / perPage),
      },
      summary,
    };
  } catch (error) {
    throw error;
  }
};

const getAdminRefundRequestDetail = async (requestId) => {
  try {
    const refundRequest =
      await refundRequestModel.getAdminRefundRequestDetail(requestId);
    if (!refundRequest) {
      throw new ApiError(
        StatusCodes.NOT_FOUND,
        "Không tìm thấy yêu cầu hoàn tiền",
      );
    }

    return {
      ...buildAdminRefundListItem(refundRequest),
      reason: refundRequest.reason || "",
      images: refundRequest.images || [],
      videos: refundRequest.videos || [],
      items: buildRefundItemsWithNames(refundRequest),
      bankInfo: refundRequest.bankInfo || null,
      refundMethod: refundRequest.refundMethod,
      rejectReason: refundRequest.rejectReason || "",
      transactionImage: refundRequest.transactionImage || "",
    };
  } catch (error) {
    throw error;
  }
};

export const refundRequestService = {
  createRefundRequest,
  getRefundRequestByOrder,
  submitBankInfo,
  approveRefundRequest,
  rejectRefundRequest,
  completeRefundRequest,
  getAdminRefundRequests,
  getAdminRefundRequestDetail,
};
