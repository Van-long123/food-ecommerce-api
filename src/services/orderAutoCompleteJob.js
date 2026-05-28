import cron from "node-cron";
import { orderModel } from "~/models/orderModel";
import { productModel } from "~/models/productModel";
import { paymentModel } from "~/models/paymentModel";
import { voucherModel } from "~/models/voucherModel";
import { voucherUsageModel } from "~/models/voucherUsageModel";
import { GET_CLIENT } from "~/config/mongodb";
import { env } from "~/config/environment";
import { cancelPayOSPaymentLink } from "~/services/payosService";
/**
 * Số ngày tối đa đơn hàng được phép ở trạng thái "shipping"
 * trước khi hệ thống tự động chuyển sang "delivered". */
const AUTO_COMPLETE_DAYS = parseInt(env.ORDER_AUTO_COMPLETE_DAYS || "3", 10);

/**
 * Xử lý một đơn hàng: chuyển "shipping" → "delivered"
 * và cộng dồn soldCount cho tất cả sản phẩm trong đơn.
 * Mỗi đơn hàng chạy trong một Transaction riêng để đảm bảo tính toàn vẹn dữ liệu. */
const processOneOrder = async (order) => {
  const session = GET_CLIENT().startSession();
  try {
    session.startTransaction();

    const orderId = order._id.toString();

    // 1. Cập nhật trạng thái → "delivered" kèm mốc deliveredAt
    // Chỉ update khi trạng thái hiện tại vẫn là shipping để tránh cộng soldCount nhiều lần.
    const updatedOrder = await orderModel.updateStatusWithDeliveredAt(
      orderId,
      null,
      "delivered",
      {
        session,
        expectedCurrentStatus: "shipping",
      },
    );
    if (!updatedOrder) {
      await session.abortTransaction();
      console.warn(
        `[AutoComplete] Bỏ qua đơn hàng ${orderId} vì trạng thái đã thay đổi trước khi job xử lý.`,
      );
      return;
    }

    // 2. Không tự động hoàn tất thanh toán COD ở đây
    // Vì dự án tách riêng luồng: Đơn hàng tự động "delivered" (đã nhận hàng),
    // nhưng thanh toán COD vẫn ở trạng thái "Chờ xác nhận thanh toán" cho đến khi Admin đối soát và duyệt thủ công sang "completed".

    // 3. Tăng soldCount cho các sản phẩm
    const items = (order.items || []).map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    }));
    await productModel.increaseSoldCountMany(items, { session });

    await session.commitTransaction();
    console.log(`[AutoComplete] Đơn hàng ${orderId} đã tự động hoàn thành.`);
  } catch (error) {
    await session.abortTransaction();
    console.error(
      `[AutoComplete] Lỗi khi xử lý đơn hàng ${order._id}:`,
      error.message,
    );
  } finally {
    await session.endSession();
  }
};

/**
 * Hàm quét DB và tự động hoàn thành các đơn hàng quá hạn. */
const runAutoComplete = async () => {
  try {
    console.log('[AutoComplete] Đang quét các đơn hàng "shipping" quá hạn...');
    const overdueOrders =
      await orderModel.findShippingOrdersOlderThan(AUTO_COMPLETE_DAYS);
    console.log("🚀 ~ runAutoComplete ~ overdueOrders:", overdueOrders);

    if (!overdueOrders.length) {
      console.log(
        "[AutoComplete] Không có đơn hàng nào cần tự động hoàn thành.",
      );
      return;
    }

    console.log(
      `[AutoComplete] Tìm thấy ${overdueOrders.length} đơn hàng cần xử lý.`,
    );

    // Xử lý tuần tự để tránh quá tải
    for (const order of overdueOrders) {
      await processOneOrder(order);
    }

    console.log("[AutoComplete] Hoàn tất chu kỳ tự động hoàn thành đơn hàng.");
  } catch (error) {
    console.error("[AutoComplete] Lỗi nghiêm trọng trong job:", error.message);
  }
};

/** Tự động hủy một đơn hàng PayOS trễ hạn, hoàn kho và hoàn voucher */
const processOverduePayOSOrder = async (order) => {
  const session = GET_CLIENT().startSession();
  try {
    session.startTransaction();

    const orderId = order._id.toString();
    const payment =
      order.payment && order.payment.length > 0 ? order.payment[0] : null;

    if (
      !payment ||
      payment.paymentMethod !== "PayOS" ||
      payment.status !== "pending"
    ) {
      await session.abortTransaction();
      return;
    }

    const paymentLinkId =
      payment.payosOrderId || payment.rawResponse?.paymentLinkId;
    if (paymentLinkId) {
      try {
        // Gọi API PayOS hủy link thanh toán
        await cancelPayOSPaymentLink(
          String(paymentLinkId),
          "Quá thời gian thanh toán",
        );
      } catch (error) {
        console.warn(
          `[PayOSExpire] Không thể hủy link ${paymentLinkId}:`,
          error?.message || error,
        );
      }
    }

    const items = (order.items || []).map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    }));

    for (const item of items) {
      // Cộng trả lại số lượng sản phẩm vào kho
      await productModel.increaseStock(item.productId, item.quantity, {
        session,
      });
    }

    await orderModel.updateStatusById(orderId, "cancelled", { session });
    // Cập nhật trạng thái Đơn hàng & Thanh toán thành 'cancelled'
    await paymentModel.updateByOrderId(
      orderId,
      {
        status: "cancelled",
        paymentUrl: "",
        rawResponse: {
          ...(payment.rawResponse || {}),
          expiredReason: "Quá thời gian thanh toán",
          expiredAt: new Date().toISOString(),
        },
      },
      { session },
    );
    if (order.voucherCode) {
      // Khôi phục lượt dùng & xóa lịch sử voucher
      const voucher = await voucherModel.findOneByCode(order.voucherCode);
      if (voucher) {
        await voucherModel.decreaseUsedCount(voucher._id, { session });
        await voucherUsageModel.deleteUsageByOrderId(orderId, { session });
      }
    }

    await session.commitTransaction();
    console.log(
      `[PayOSExpire] Đơn hàng ${orderId} đã tự động hủy do quá hạn thanh toán.`,
    );
  } catch (error) {
    await session.abortTransaction();
    console.error(
      `[PayOSExpire] Lỗi khi xử lý đơn hàng ${order._id}:`,
      error.message,
    );
  } finally {
    await session.endSession();
  }
};

/** Quét và kích hoạt quy trình hủy các đơn hàng PayOS pending quá hạn */
const runExpirePendingPayOSOrders = async () => {
  try {
    console.log(
      "[PayOSExpire] Đang quét các đơn hàng PayOS pending quá hạn...",
    );
    const overdueOrders = await orderModel.findPendingPayOSOrdersOlderThan(30);

    if (!overdueOrders.length) {
      console.log("[PayOSExpire] Không có đơn hàng nào cần xử lý.");
      return;
    }

    for (const order of overdueOrders) {
      await processOverduePayOSOrder(order);
    }
  } catch (error) {
    console.error("[PayOSExpire] Lỗi nghiêm trọng trong job:", error.message);
  }
};

/**
 * node-cron là thư viện trong Node.js dùng để chạy các tác vụ theo lịch tự động
 * Khởi chạy cron job tự động hoàn thành đơn hàng.
 * Lịch mặc định: chạy mỗi giờ vào đầu giờ (0 * * * *). */
export const startOrderAutoCompleteJob = () => {
  const schedule = "0 * * * *"; //Chạy mỗi giờ
  // const schedule = "* * * * *"; // Chạy mỗi phút

  cron.schedule(schedule, runAutoComplete, {
    scheduled: true,
    timezone: "Asia/Ho_Chi_Minh",
    // recoverMissedExecutions: false,
  });

  console.log(
    `[AutoComplete] Job đã khởi chạy. Lịch: "${schedule}" | Tự động hoàn thành sau ${AUTO_COMPLETE_DAYS} ngày giao hàng.`,
  );

  // Mỗi 5 phút: Cron kích hoạt
  cron.schedule("*/5 * * * *", runExpirePendingPayOSOrders, {
    scheduled: true,
    timezone: "Asia/Ho_Chi_Minh",
    // recoverMissedExecutions: false,
  });

  console.log(
    '[PayOSExpire] Job đã khởi chạy. Lịch: "*/5 * * * *" | Tự động hủy đơn PayOS pending sau 30 phút.',
  );
};
