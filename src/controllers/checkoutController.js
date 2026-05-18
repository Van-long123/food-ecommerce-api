import { StatusCodes } from "http-status-codes";
import { checkoutService } from "~/services/checkoutService";

const getShippingFee = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id;
    const { addressId, products } = req.body;

    const result = await checkoutService.getShippingFee(
      userId,
      addressId,
      products,
    );

    res.status(StatusCodes.OK).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const createCodCheckout = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id;
    const result = await checkoutService.createCodCheckout(userId, req.body);

    res.status(StatusCodes.CREATED).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const createPayOSCheckout = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id;
    const result = await checkoutService.createPayOSCheckout(userId, req.body);

    res.status(StatusCodes.CREATED).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const handlePayOSWebhook = async (req, res, next) => {
  try {
    const result = await checkoutService.handlePayOSWebhook(req.body);

    // QUAN TRỌNG: Luôn trả 200 để PayOS dừng gửi retry
    res.status(StatusCodes.OK).json({
      success: true,
      data: result,
    });
  } catch (error) {
    // Nếu lỗi xác thực chữ ký → next(error) để trả 401
    // Nếu lỗi khác → vẫn trả 200 để tránh PayOS retry liên tục gây spam
    if (error?.statusCode === StatusCodes.UNAUTHORIZED) {
      return next(error);
    }
    console.error("[PayOS Webhook Error]", error);
    res.status(StatusCodes.OK).json({ success: false, error: error?.message });
  }
};

export const checkoutController = {
  getShippingFee,
  createCodCheckout,
  createPayOSCheckout,
  handlePayOSWebhook,
};
