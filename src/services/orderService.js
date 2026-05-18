import { StatusCodes } from "http-status-codes";
import { orderModel } from "~/models/orderModel";
import { orderItemModel } from "~/models/orderItemModel";
import { productModel } from "~/models/productModel";
import { paymentModel } from "~/models/paymentModel";
import { voucherModel } from "~/models/voucherModel";
import { voucherUsageModel } from "~/models/voucherUsageModel";
import { GET_CLIENT } from "~/config/mongodb";
import ApiError from "~/utils/ApiError";

/**
 * Kiểm tra tồn kho thực tế trước khi checkout
 * @param {Array} items - [{ productId, quantity }, ...]
 * @returns { valid: [], clamped: [], outOfStock: [] }
 */
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

      // Trường hợp Thiếu hàng (Muốn 100kg nhưng chỉ còn 10kg)
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
      productId: item.id.toString(), // Chuyển sang string cho thống nhất model
      title: item.title,
      thumbnail: item.thumbnail,
      quantity: item.quantity,
      price: item.priceNew,
      totalPrice: item.totalPrice,
    }));

    // 3. Save order items
    await orderItemModel.createMany(orderItems);

    // Future: Reduce stock, remove from cart, clear voucher usage, etc.

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

    // Format response
    return orders.map((order) => ({
      _id: order._id,
      code: order.orderCode ? String(order.orderCode) : order._id.toString().substring(18).toUpperCase(), // Dùng orderCode nếu có, không thì fallback về 6 ký tự cuối của ID
      status: order.status,
      totalPrice: order.totalPrice,
      createdAt: order.createdAt,
      paymentMethod: order.payment && order.payment.length > 0 ? order.payment[0].paymentMethod : 'N/A',
      paymentStatus: order.payment && order.payment.length > 0 ? order.payment[0].status : 'N/A',
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

    // Extract payment
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

const cancelOrder = async (orderId, userId) => {
  // Khởi tạo một session MongoDB mới để thực hiện Transaction
  const session = GET_CLIENT().startSession();
  try {
    // Bắt đầu Transaction, đảm bảo tính toàn vẹn dữ liệu (nếu 1 bước lỗi sẽ rollback toàn bộ)
    session.startTransaction();

    // 1. Kiểm tra tính hợp lệ của đơn hàng
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

    // 2. Hoàn trả lại số lượng sản phẩm vào kho
    const items = order.items || [];
    for (const item of items) {
      await productModel.increaseStock(item.productId, item.quantity, { session });
    }

    // 3. Cập nhật trạng thái đơn hàng thành "cancelled" (đã hủy)
    await orderModel.updateStatus(orderId, userId, "cancelled", { session });

    // 4. Cập nhật trạng thái giao dịch thanh toán tương ứng thành "cancelled"
    await paymentModel.updateStatusByOrderId(orderId, "cancelled", { session });

    // 5. Khôi phục lại lượt sử dụng voucher nếu đơn hàng có áp dụng
    if (order.voucherCode) {
      const voucher = await voucherModel.findOneByCode(order.voucherCode);
      if (voucher) {
        await voucherModel.decreaseUsedCount(voucher._id, { session });
        await voucherUsageModel.deleteUsageByOrderId(orderId, { session });
      }
    }

    // Xác nhận (commit) lưu tất cả các thay đổi của Transaction vào Database
    await session.commitTransaction();
    return { success: true, message: "Hủy đơn hàng thành công" };
  } catch (error) {
    // Nếu có lỗi xảy ra ở bất kỳ bước nào, hủy bỏ (rollback) toàn bộ các thay đổi
    await session.abortTransaction();
    throw error;
  } finally {
    // Kết thúc và giải phóng session sau khi hoàn thành hoặc có lỗi
    await session.endSession();
  }
};

export const orderService = {
  validateStockBeforeCheckout,
  createNew,
  getOrdersByUserId,
  getOrderDetails,
  cancelOrder,
};
