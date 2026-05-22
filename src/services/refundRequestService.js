import { StatusCodes } from "http-status-codes";
import { GET_CLIENT } from "~/config/mongodb";
import { orderModel } from "~/models/orderModel";
import { refundRequestModel } from "~/models/refundRequestModel";
import { userModel } from "~/models/userModel";
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

//  chuẩn hóa danh sách sản phẩm yêu cầu hoàn tiền và tính toán tổng số tiền cần hoàn
const buildRefundItems = (orderItems = [], requestedItems = []) => {
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

    const price = Math.max(0, Number(orderItem.price || 0));
    return {
      productId: item.productId,
      quantity: item.quantity,
      price,
    };
  });

  //  Tính tổng số tiền hoàn
  const amount = refundItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  return { refundItems, amount };
};

const createRefundRequest = async (userId, payload) => {
  try {
    const {
      orderId,
      items,
      reason,
      images = [],
      videos = [],
      refundMethod = "bank_transfer",
    } = payload || {};

    if (!orderId) {
      throw new ApiError(StatusCodes.BAD_REQUEST, "Thiếu mã đơn hàng");
    }

    if (!Array.isArray(images) || images.length === 0) {
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

    const { refundItems, amount } = buildRefundItems(order.items || [], items);

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
      images,
      videos: Array.isArray(videos) ? videos : [],
      amount,
      refundMethod: normalizedRefundMethod,
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

    await session.commitTransaction();

    if (updatedRefund) {
      const user = await userModel.findOneById(updatedRefund.userId.toString());
      if (user?.email) {
        const emailHtml = getRefundCompletedTemplate({
          orderId: updatedRefund.orderId?.toString() || "",
          amount: updatedRefund.amount || 0,
          transactionImage: updatedRefund.transactionImage || "",
          refundMethod: updatedRefund.refundMethod || "bank_transfer",
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

    return updatedRefund;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};

export const refundRequestService = {
  createRefundRequest,
  getRefundRequestByOrder,
  approveRefundRequest,
  rejectRefundRequest,
  completeRefundRequest,
};
