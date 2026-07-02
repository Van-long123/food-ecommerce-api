import { StatusCodes } from "http-status-codes";
import { ObjectId } from "mongodb";
import { orderModel } from "~/models/orderModel";
import { productModel } from "~/models/productModel";
import { paymentModel } from "~/models/paymentModel";
import { voucherModel } from "~/models/voucherModel";
import { voucherUsageModel } from "~/models/voucherUsageModel";
import { refundRequestModel } from "~/models/refundRequestModel";
import { GET_CLIENT, GET_DB } from "~/config/mongodb";
import ApiError from "~/utils/ApiError";
import { userModel } from "~/models/userModel";
import { sendMail } from "~/utils/sendMail";
import { getOrderShippingTemplate } from "~/templates/emailTemplates";
import {
  cancelPayOSPaymentLink,
  createPayOSPaymentLink,
  getPayOSExpiredAt,
  getPayOSPaymentLink,
  isPayOSLinkActive,
} from "~/services/payosService";
import { env } from "~/config/environment";
import { socketManager, SOCKET_EVENTS } from "~/sockets/socketManager";

// Luồng trạng thái hợp lệ (dùng chung cho Admin update)
const ALLOWED_STATUS_TRANSITIONS = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipping", "cancelled"],
  shipping: ["delivered"],
  delivered: ["returned"],
  cancelled: [],
  returned: [],
};

// CLIENT-SIDE FUNCTIONS
/**
 * Kiểm tra tồn kho thực tế trước khi checkout */
const validateStockBeforeCheckout = async (items = []) => {
  try {
    const productIds = Array.from(
      new Set(
        items.map((item) => String(item.productId || "")).filter(Boolean),
      ),
    );

    if (productIds.length === 0) {
      throw new ApiError(
        StatusCodes.UNPROCESSABLE_ENTITY,
        "Danh sách sản phẩm trống",
      );
    }

    const products = await productModel.findManyByIds(productIds);
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));

    const result = {
      valid: [],
      clamped: [],
      outOfStock: [],
    };

    items.forEach((item) => {
      const productId = String(item.productId || "");
      const requestedQty = Math.max(1, Number(item.quantity || 0));

      const product = productMap.get(productId);

      if (
        !product ||
        product.deleted ||
        product.status !== productModel.PRODUCT_STATUSES.ACTIVE
      ) {
        result.outOfStock.push({
          productId,
          name: product?.title || "Sản phẩm",
          currentStock: 0,
          reason: "unavailable",
        });
        return;
      }

      const stock = typeof product.stock === "number" ? product.stock : 0;

      if (stock <= 0) {
        result.outOfStock.push({
          productId,
          name: product.title || "Sản phẩm",
          currentStock: 0,
          reason: "out_of_stock",
        });
        return;
      }

      // Trường hợp thiếu hàng (muốn 100kg nhưng chỉ còn 10kg)
      if (requestedQty > stock) {
        result.clamped.push({
          productId,
          name: product.title || "Sản phẩm",
          requestedQty,
          currentStock: stock,
          reason: "insufficient_stock",
        });
        return;
      }

      result.valid.push({
        productId,
        name: product.title || "Sản phẩm",
        currentStock: stock,
        quantity: requestedQty,
      });
    });

    return result;
  } catch (error) {
    throw error;
  }
};

const createNew = async (userId, payload) => {
  try {
    const { products, ...orderInfo } = payload;

    const orderData = {
      ...orderInfo,
      userId,
    };

    // 1. Save order info
    const orderResult = await orderModel.createNew(orderData);
    const orderId = orderResult.insertedId.toString();

    // 2. Prepare order items
    const orderItems = products.map((item) => ({
      orderId,
      productId: item.id.toString(),
      title: item.title,
      thumbnail: item.thumbnail,
      quantity: item.quantity,
      price: item.priceNew,
      totalPrice: item.totalPrice,
    }));

    // 3. Save order items
    await orderItemModel.createMany(orderItems);

    return {
      ...orderResult,
      orderId,
    };
  } catch (error) {
    throw error;
  }
};

const getOrdersByUserId = async (userId) => {
  try {
    const orders = await orderModel.findByUserId(userId);

    return orders.map((order) => ({
      _id: order._id,
      code: order.orderCode
        ? String(order.orderCode)
        : order._id.toString().substring(18).toUpperCase(),
      status: order.status,
      totalPrice: order.totalPrice,
      createdAt: order.createdAt,
      paymentMethod:
        order.payment && order.payment.length > 0
          ? order.payment[0].paymentMethod
          : "N/A",
      paymentStatus:
        order.payment && order.payment.length > 0
          ? order.payment[0].status
          : "N/A",
      items: order.items.map((item) => ({
        productId: item.productId,
        title: item.title,
        thumbnail: item.thumbnail,
        quantity: item.quantity,
        price: item.price,
        totalPrice: item.totalPrice,
      })),
    }));
  } catch (error) {
    throw error;
  }
};

const getOrderDetails = async (orderId, userId) => {
  try {
    const order = await orderModel.findByIdAndUserId(orderId, userId);
    if (!order) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Không tìm thấy đơn hàng");
    }

    const payment =
      order.payment && order.payment.length > 0 ? order.payment[0] : null;
    delete order.payment;

    return {
      ...order,
      payment,
    };
  } catch (error) {
    throw error;
  }
};

const repayOrder = async (orderId, userId) => {
  const order = await orderModel.findByIdAndUserId(orderId, userId);
  if (!order) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Không tìm thấy đơn hàng");
  }

  if (order.status !== "pending") {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Chỉ có thể thanh toán lại đơn hàng đang chờ xử lý");
  }

  const payment = order.payment && order.payment.length > 0 ? order.payment[0] : null;
  if (!payment || payment.paymentMethod !== "PayOS" || payment.status !== "pending") {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Đơn hàng không đủ điều kiện thanh toán lại");
  }

  // Luôn verify trạng thái thực tế từ PayOS thay vì tin vào cache DB.
  // Lý do: user có thể đã bấm "Hủy" trên trang PayOS → PayOS huỷ link phía họ
  // nhưng webhook cancel (code !== '00') không update DB → DB vẫn "pending" / URL cũ vẫn còn
  // → isPayOSLinkActive trả về true → trả URL chết → PayOS báo "Đơn hàng không tồn tại".
  if (payment.payosOrderId) {
    try {
      const paymentLinkInfo = await getPayOSPaymentLink(String(payment.payosOrderId));

      if (
        paymentLinkInfo?.checkoutUrl &&
        paymentLinkInfo?.status === "PENDING" &&
        (!paymentLinkInfo?.expiredAt || paymentLinkInfo.expiredAt * 1000 > Date.now())
      ) {
        await paymentModel.updateByOrderId(orderId, {
          paymentUrl: paymentLinkInfo.checkoutUrl,
          payosOrderId: String(paymentLinkInfo.paymentLinkId || payment.payosOrderId || order.orderCode),
          expiresAt: paymentLinkInfo.expiredAt
            ? new Date(paymentLinkInfo.expiredAt * 1000)
            : payment.expiresAt || new Date(Date.now() + 30 * 60 * 1000),
          rawResponse: paymentLinkInfo,
        });

        return { checkoutUrl: paymentLinkInfo.checkoutUrl };
      }
    } catch (error) {
      console.warn("[PayOS] Không thể lấy link cũ, tạo link mới:", error?.message || error);
    }
  }

  // Sinh orderCode MỚI để tránh PayOS báo lỗi trùng orderCode với link cũ đã hết hạn/bị hủy
  const newOrderCode = Number(String(Date.now()).slice(-9));

  const paymentLink = await createPayOSPaymentLink({
    orderCode: newOrderCode,
    amount: Number(order.totalPrice || payment.amount || 0),
    description: `SmartFood #${newOrderCode}`.slice(0, 25),
    cancelUrl: `${env.BUILD_MODE === 'production' ? env.WEBSITE_DOMAIN_PROD : env.WEBSITE_DOMAIN_DEV}/order/${orderId}`,
    returnUrl: `${env.BUILD_MODE === 'production' ? env.WEBSITE_DOMAIN_PROD : env.WEBSITE_DOMAIN_DEV}/order/${orderId}`,
    buyerName: order.userInfo?.fullname || "Khách hàng",
    buyerPhone: order.userInfo?.phone || "",
    expiredAt: getPayOSExpiredAt(),
  });

  // Cập nhật orderCode mới vào orders để Webhook PayOS vẫn tìm được đơn hàng
  await GET_DB()
    .collection("orders")
    .updateOne(
      { _id: new ObjectId(orderId) },
      { $set: { orderCode: newOrderCode, updatedAt: new Date() } },
    );

  await paymentModel.updateByOrderId(orderId, {
    paymentUrl: paymentLink.checkoutUrl,
    payosOrderId: String(paymentLink.paymentLinkId || newOrderCode),
    expiresAt: paymentLink.expiredAt
      ? new Date(paymentLink.expiredAt * 1000)
      : new Date(Date.now() + 30 * 60 * 1000),
    rawResponse: paymentLink,
  });

  return { checkoutUrl: paymentLink.checkoutUrl };
};

const switchOrderToCod = async (orderId, userId) => {
  const session = GET_CLIENT().startSession();
  try {
    session.startTransaction();

    const order = await orderModel.findByIdAndUserId(orderId, userId);
    if (!order) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Không tìm thấy đơn hàng");
    }

    if (order.status !== "pending") {
      throw new ApiError(StatusCodes.BAD_REQUEST, "Chỉ có thể đổi phương thức thanh toán khi đơn hàng đang chờ xử lý");
    }

    const payment = order.payment && order.payment.length > 0 ? order.payment[0] : null;
    if (!payment || payment.paymentMethod !== "PayOS" || payment.status !== "pending") {
      throw new ApiError(StatusCodes.BAD_REQUEST, "Đơn hàng không đủ điều kiện đổi sang COD");
    }

    const paymentLinkId = payment.payosOrderId || payment.rawResponse?.paymentLinkId;
    if (paymentLinkId) {
      await cancelPayOSPaymentLink(String(paymentLinkId), "Khách hàng đổi sang COD");
    }

    await paymentModel.updateByOrderId(
      orderId,
      {
        paymentMethod: "COD",
        status: "pending",
        paymentUrl: "",
        expiresAt: null,
        rawResponse: {
          ...(payment.rawResponse || {}),
          switchedToCodAt: new Date().toISOString(),
        },
      },
      { session },
    );

    await session.commitTransaction();
    return await getOrderDetails(orderId, userId);
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};

const cancelOrder = async (orderId, userId, payload = {}) => {
  const session = GET_CLIENT().startSession();
  try {
    session.startTransaction();

    const order = await orderModel.findByIdAndUserId(orderId, userId);
    if (!order) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Không tìm thấy đơn hàng");
    }

    if (order.status !== "pending" && order.status !== "confirmed") {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "Chỉ có thể hủy đơn hàng ở trạng thái chờ xác nhận hoặc đã xác nhận",
      );
    }

    const payment =
      order.payment && order.payment.length > 0 ? order.payment[0] : null;

    const isPaidViaPayOS =
      payment &&
      payment.paymentMethod === "PayOS" &&
      payment.status === "completed";

    if (isPaidViaPayOS) {
      const { reason, bankName, accountNumber, accountHolderName } = payload;
      if (!bankName || !accountNumber || !accountHolderName || !reason) {
        throw new ApiError(
          StatusCodes.BAD_REQUEST,
          "Vui lòng cung cấp đầy đủ lý do hủy và thông tin tài khoản ngân hàng để nhận hoàn tiền",
        );
      }
    }

    const items = order.items || [];
    for (const item of items) {
      await productModel.increaseStock(item.productId, item.quantity, {
        session,
      });
    }

    await orderModel.updateStatus(orderId, userId, "cancelled", { session });
    await paymentModel.updateStatusByOrderId(orderId, "cancelled", { session });

    if (order.voucherCode) {
      const voucher = await voucherModel.findOneByCode(order.voucherCode);
      if (voucher) {
        await voucherModel.decreaseUsedCount(voucher._id, { session });
        await voucherUsageModel.deleteUsageByOrderId(orderId, { session });
      }
    }

    if (isPaidViaPayOS) {
      const { reason, bankName, accountNumber, accountHolderName } = payload;

      const refundItems = items.map((item) => ({
        productId: item.productId.toString(),
        quantity: item.quantity,
        price: item.price,
      }));

      await refundRequestModel.createNew(
        {
          orderId: order._id.toString(),
          userId: userId.toString(),
          items: refundItems,
          amount: order.totalPrice,
          reason: reason.trim(),
          refundMethod: "bank_transfer",
          bankInfo: {
            bankName: bankName.trim(),
            accountNumber: accountNumber.trim(),
            accountHolder: accountHolderName.trim(),
          },
          status: "pending",
        },
        { session },
      );
    }

    await session.commitTransaction();

    // Emit realtime event đến client ngay sau khi hủy đơn thành công
    socketManager.emitToUser(String(userId), SOCKET_EVENTS.ORDER_STATUS_UPDATED, {
      orderId: String(orderId),
      orderCode: order.orderCode,
      status: "cancelled",
    });

    // Thông báo cho Admin realtime
    socketManager.emitToAdmins(SOCKET_EVENTS.ORDER_STATUS_UPDATED, {
      orderId: String(orderId),
      orderCode: order.orderCode,
      status: "cancelled",
    });

    if (isPaidViaPayOS) {
      return {
        success: true,
        message:
          "Hủy đơn hàng và gửi yêu cầu hoàn tiền thành công. Tiền sẽ được hoàn lại sau khi cửa hàng xác nhận.",
        hasRefundRequest: true,
      };
    }
    return { success: true, message: "Hủy đơn hàng thành công" };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};

/**
 * Xác nhận đã nhận hàng (client) — mở khóa tính năng đánh giá sản phẩm. */
const confirmReceived = async (orderId, userId) => {
  const session = GET_CLIENT().startSession();
  try {
    session.startTransaction();

    const order = await orderModel.findByIdAndUserId(orderId, userId);
    if (!order) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Không tìm thấy đơn hàng");
    }

    if (order.status !== "shipping") {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "Chỉ có thể xác nhận nhận hàng khi đơn hàng đang được giao",
      );
    }

    const updatedOrder = await orderModel.updateStatusWithDeliveredAt(
      orderId,
      userId,
      "delivered",
      {
        session,
        expectedCurrentStatus: "shipping",
      },
    );

    if (!updatedOrder) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "Đơn hàng không còn ở trạng thái đang giao để xác nhận nhận hàng",
      );
    }

    const items = (order.items || []).map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    }));
    await productModel.increaseSoldCountMany(items, { session });

    await session.commitTransaction();

    // Emit realtime event đến client sau khi xác nhận nhận hàng thành công
    socketManager.emitToUser(String(userId), SOCKET_EVENTS.ORDER_STATUS_UPDATED, {
      orderId: String(orderId),
      orderCode: order.orderCode,
      status: "delivered",
    });

    // Thông báo cho Admin realtime
    socketManager.emitToAdmins(SOCKET_EVENTS.ORDER_STATUS_UPDATED, {
      orderId: String(orderId),
      orderCode: order.orderCode,
      status: "delivered",
    });

    return { success: true, message: "Xác nhận nhận hàng thành công" };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};

// ADMIN-SIDE FUNCTIONS
/**
 * Lấy danh sách đơn hàng cho Admin với phân trang, tìm kiếm, lọc, sắp xếp. */
const getAdminOrders = async ({
  page = 1,
  perPage = 10,
  keyword = "",
  status = "",
  sortField = "createdAt",
  sortOrder = "desc",
} = {}) => {
  try {
    const query = {};
    if (status && status !== "all") {
      query.status = status;
    }
    if (keyword) {
      const kw = keyword.trim();
      const isNumber = /^\d+$/.test(kw);
      query.$or = [
        ...(isNumber ? [{ orderCode: Number(kw) }] : []),
        { "userInfo.fullname": { $regex: kw, $options: "i" } },
        { "userInfo.phone": { $regex: kw, $options: "i" } },
        // { voucherCode: { $regex: kw, $options: "i" } },
      ];
    }

    const sort = { [sortField]: sortOrder === "asc" ? 1 : -1 };
    const skip = (page - 1) * perPage;

    const [orders, total] = await Promise.all([
      orderModel.getAdminOrders({ query, sort, skip, limit: perPage }),
      orderModel.countAdminOrders(query),
    ]);

    return {
      data: orders,
      pagination: {
        page: Number(page),
        perPage: Number(perPage),
        total,
        totalPages: Math.ceil(total / perPage),
      },
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Lấy chi tiết đơn hàng cho Admin (không ràng buộc userId).
 * Tái sử dụng nội bộ bởi updateAdminOrderStatus và confirmCodPayment. */
const getAdminOrderDetail = async (orderId, session) => {
  try {
    const order = await orderModel.getAdminOrderDetail(orderId, { session });
    if (!order) {
      throw new ApiError(StatusCodes.NOT_FOUND, "Không tìm thấy đơn hàng");
    }
    return order;
  } catch (error) {
    throw error;
  }
};

const updateAdminOrderStatusInternal = async (
  orderId,
  newStatus,
  adminId,
  session,
) => {
  const order = await getAdminOrderDetail(orderId, session);

  const allowed = ALLOWED_STATUS_TRANSITIONS[order.status] ?? [];
  if (!allowed.includes(newStatus)) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      `Không thể chuyển từ trạng thái "${order.status}" sang "${newStatus}"`,
    );
  }

  if (newStatus === "delivered") {
    await orderModel.updateAdminStatus(orderId, newStatus, adminId, {
      session,
    });

    const payment = order.payment;
    if (payment && payment.paymentMethod === "COD") {
      await paymentModel.updateStatusByOrderId(orderId, "completed", {
        session,
      });
    }

    const items = (order.items || []).map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    }));
    await productModel.increaseSoldCountMany(items, { session });
  } else if (newStatus === "cancelled") {
    const items = order.items || [];
    for (const item of items) {
      await productModel.increaseStock(item.productId, item.quantity, {
        session,
      });
    }
    await paymentModel.updateStatusByOrderId(orderId, "cancelled", {
      session,
    });
    if (order.voucherCode) {
      const voucher = await voucherModel.findOneByCode(order.voucherCode);
      if (voucher) {
        await voucherModel.decreaseUsedCount(voucher._id, { session });
        await voucherUsageModel.deleteUsageByOrderId(orderId, { session });
      }
    }

    await orderModel.updateAdminStatus(orderId, newStatus, adminId, {
      session,
    });
  } else {
    await orderModel.updateAdminStatus(orderId, newStatus, adminId, {
      session,
    });

    if (newStatus === "shipping") {
      try {
        const user = await userModel.findOneById(order.userId.toString());
        if (user && user.email) {
          const emailHtml = getOrderShippingTemplate({
            orderId: order._id.toString(),
            customerName: order.userInfo?.fullname || user.fullname,
            items: order.items || [],
            totalPay: order.totalPrice || 0,
          });

          sendMail(
            user.email,
            `Đơn hàng #${order._id.toString()} đang được giao - SmartFood`,
            emailHtml,
          ).catch((err) =>
            console.error("Lỗi gửi email thông báo giao hàng:", err),
          );
        }
      } catch (emailErr) {
        console.error("Lỗi chuẩn bị email thông báo giao hàng:", emailErr);
      }
    }
  }

  return await getAdminOrderDetail(orderId, session);
};

/**
 * Admin cập nhật trạng thái đơn hàng.
 * Tự động xử lý: hoàn kho, hủy/hoàn payment, khôi phục voucher, tăng soldCount. */
const updateAdminOrderStatus = async (orderId, newStatus, adminId) => {
  const session = GET_CLIENT().startSession();
  try {
    session.startTransaction();
    const updatedOrder = await updateAdminOrderStatusInternal(
      orderId,
      newStatus,
      adminId,
      session,
    );
    await session.commitTransaction();

    // Emit realtime event đến client sở hữu đơn hàng này
    if (updatedOrder?.userId) {
      socketManager.emitToUser(String(updatedOrder.userId), SOCKET_EVENTS.ORDER_STATUS_UPDATED, {
        orderId: String(orderId),
        orderCode: updatedOrder.orderCode,
        status: newStatus,
      });
    }

    return updatedOrder;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};

const bulkUpdateAdminOrderStatus = async (
  orderIds = [],
  newStatus,
  adminId,
) => {
  const session = GET_CLIENT().startSession();
  try {
    const uniqueOrderIds = [
      ...new Set(orderIds.map((id) => String(id)).filter(Boolean)),
    ];
    if (uniqueOrderIds.length === 0) {
      throw new ApiError(StatusCodes.BAD_REQUEST, "Danh sách đơn hàng trống");
    }

    session.startTransaction();

    const updatedOrders = [];
    for (const orderId of uniqueOrderIds) {
      const updatedOrder = await updateAdminOrderStatusInternal(
        orderId,
        newStatus,
        adminId,
        session,
      );
      updatedOrders.push(updatedOrder);
    }

    await session.commitTransaction();

    // Emit realtime event đến từng user sở hữu đơn hàng
    updatedOrders.forEach((updatedOrder) => {
      if (updatedOrder?.userId) {
        socketManager.emitToUser(String(updatedOrder.userId), SOCKET_EVENTS.ORDER_STATUS_UPDATED, {
          orderId: String(updatedOrder._id),
          orderCode: updatedOrder.orderCode,
          status: newStatus,
        });
      }
    });

    return {
      success: true,
      message: `Đã cập nhật trạng thái cho ${updatedOrders.length} đơn hàng`,
      updatedCount: updatedOrders.length,
      data: updatedOrders,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};

/**
 * Lấy danh sách thanh toán cho Admin với phân trang, tìm kiếm, lọc. */
const getAdminPayments = async ({
  page = 1,
  perPage = 10,
  keyword = "",
  status = "",
  paymentMethod = "",
  sortField = "createdAt",
  sortOrder = "desc",
} = {}) => {
  try {
    const query = {};
    if (status && status !== "all") query.status = status;
    if (paymentMethod && paymentMethod !== "all")
      query.paymentMethod = paymentMethod;

    const sort = { [sortField]: sortOrder === "asc" ? 1 : -1 };
    const skip = (page - 1) * perPage;

    const { data, total } = await paymentModel.getAdminPayments({
      query,
      keyword,
      sort,
      skip,
      limit: perPage,
    });

    return {
      data,
      pagination: {
        page: Number(page),
        perPage: Number(perPage),
        total,
        totalPages: Math.ceil(total / perPage),
      },
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Admin xác nhận đã thu tiền COD → cập nhật payment + đơn hàng sang delivered.
 * Tái sử dụng getAdminOrderDetail để lấy items cho soldCount. */
const confirmCodPayment = async (paymentId, adminId) => {
  const session = GET_CLIENT().startSession();
  try {
    session.startTransaction();

    const payment = await paymentModel.findById(paymentId, { session });

    if (!payment) {
      throw new ApiError(
        StatusCodes.NOT_FOUND,
        "Không tìm thấy giao dịch thanh toán",
      );
    }
    if (!["COD", "PayOS"].includes(payment.paymentMethod)) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "Chỉ xác nhận được giao dịch COD hoặc PayOS",
      );
    }
    if (payment.status !== "pending") {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "Giao dịch đã được xử lý trước đó",
      );
    }

    const orderId = payment.orderId.toString();

    // Cập nhật payment → completed
    await paymentModel.updateStatus(paymentId, "completed", null);

    // Cập nhật đơn hàng → delivered + deliveredAt
    await orderModel.updateAdminStatus(orderId, "delivered", adminId, {
      session,
    });

    // Tăng soldCount — tái sử dụng getAdminOrderDetail
    const order = await getAdminOrderDetail(orderId, session);
    const items = (order.items || []).map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    }));
    await productModel.increaseSoldCountMany(items, { session });

    await session.commitTransaction();

    // Emit realtime event đến client sau khi admin xác nhận COD/PayOS payment
    if (order?.userId) {
      socketManager.emitToUser(String(order.userId), SOCKET_EVENTS.ORDER_STATUS_UPDATED, {
        orderId: String(orderId),
        status: "delivered",
      });
    }

    return {
      success: true,
      message: `Đã xác nhận thu tiền ${payment.paymentMethod} thành công`,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};

/**
 * Thống kê nhanh trạng thái payment cho Admin Dashboard. */
const getPaymentStats = async () => {
  try {
    const stats = await paymentModel.getPaymentStats();

    const result = { pending: 0, completed: 0, cancelled: 0, totalRevenue: 0 };
    stats.forEach((s) => {
      result[s._id] = s.count;
      if (s._id === "completed") result.totalRevenue = s.totalAmount;
    });
    return result;
  } catch (error) {
    throw error;
  }
};

export const orderService = {
  // Client
  validateStockBeforeCheckout,
  createNew,
  getOrdersByUserId,
  getOrderDetails,
  cancelOrder,
  confirmReceived,
  repayOrder,
  switchOrderToCod,
  // Admin
  getAdminOrders,
  getAdminOrderDetail,
  updateAdminOrderStatus,
  bulkUpdateAdminOrderStatus,
  getAdminPayments,
  confirmCodPayment,
  getPaymentStats,
};
