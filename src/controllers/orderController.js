import { StatusCodes } from "http-status-codes";
import { orderService } from "~/services/orderService";

// CLIENT-SIDE HANDLERS
const validateStock = async (req, res, next) => {
  try {
    const items = req.body.items || [];
    const result = await orderService.validateStockBeforeCheckout(items);

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Kiểm tra tồn kho thành công",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const createNew = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id;
    const payload = req.body;

    const result = await orderService.createNew(userId, payload);

    res.status(StatusCodes.CREATED).json({
      success: true,
      message: "Đặt hàng thành công",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getMyOrders = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id;

    const result = await orderService.getOrdersByUserId(userId);

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Lấy danh sách đơn hàng thành công",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getOrderDetails = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id;
    const orderId = req.params.id;

    const result = await orderService.getOrderDetails(orderId, userId);

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Lấy thông tin đơn hàng thành công",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const cancelOrder = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id;
    const orderId = req.params.id;
    const payload = req.body || {};

    const result = await orderService.cancelOrder(orderId, userId, payload);

    res.status(StatusCodes.OK).json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const confirmReceived = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id;
    const orderId = req.params.id;

    const result = await orderService.confirmReceived(orderId, userId);

    res.status(StatusCodes.OK).json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// ADMIN-SIDE HANDLERS

const getOrders = async (req, res, next) => {
  try {
    const { page, perPage, keyword, status, sortField, sortOrder } = req.query;
    const result = await orderService.getAdminOrders({
      page: Number(page) || 1,
      perPage: Number(perPage) || 10,
      keyword: keyword || "",
      status: status || "",
      sortField: sortField || "createdAt",
      sortOrder: sortOrder || "desc",
    });

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Lấy danh sách đơn hàng thành công",
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

const getOrderDetailAdmin = async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const result = await orderService.getAdminOrderDetail(orderId);

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Lấy chi tiết đơn hàng thành công",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const updateOrderStatus = async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const adminId = req.jwtDecoded._id;
    const { status } = req.body;

    if (!status) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Trạng thái mới là bắt buộc",
      });
    }

    const result = await orderService.updateAdminOrderStatus(
      orderId,
      status,
      adminId,
    );

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Cập nhật trạng thái đơn hàng thành công",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const bulkUpdateOrderStatus = async (req, res, next) => {
  try {
    const adminId = req.jwtDecoded._id;
    const { order_ids: orderIds, status } = req.body || {};

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Danh sách đơn hàng là bắt buộc",
      });
    }

    if (!status) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Trạng thái mới là bắt buộc",
      });
    }

    const result = await orderService.bulkUpdateAdminOrderStatus(
      orderIds,
      status,
      adminId,
    );

    res.status(StatusCodes.OK).json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getPayments = async (req, res, next) => {
  try {
    const {
      page,
      perPage,
      keyword,
      status,
      paymentMethod,
      sortField,
      sortOrder,
    } = req.query;
    const result = await orderService.getAdminPayments({
      page: Number(page) || 1,
      perPage: Number(perPage) || 10,
      keyword: keyword || "",
      status: status || "",
      paymentMethod: paymentMethod || "",
      sortField: sortField || "createdAt",
      sortOrder: sortOrder || "desc",
    });

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Lấy danh sách thanh toán thành công",
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

const confirmCodPayment = async (req, res, next) => {
  try {
    const paymentId = req.params.id;
    const adminId = req.jwtDecoded._id;

    const result = await orderService.confirmCodPayment(paymentId, adminId);

    res.status(StatusCodes.OK).json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getPaymentStats = async (req, res, next) => {
  try {
    const result = await orderService.getPaymentStats();

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Lấy thống kê thanh toán thành công",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const orderController = {
  // Client
  validateStock,
  createNew,
  getMyOrders,
  getOrderDetails,
  cancelOrder,
  confirmReceived,
  // Admin
  getOrders,
  getOrderDetailAdmin,
  updateOrderStatus,
  bulkUpdateOrderStatus,
  getPayments,
  confirmCodPayment,
  getPaymentStats,
};
