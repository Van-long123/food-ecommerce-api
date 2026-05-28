import { PayOS } from "@payos/node";
import { StatusCodes } from "http-status-codes";
import { env } from "~/config/environment";
import ApiError from "~/utils/ApiError";

// Khởi tạo PayOS SDK
const payos = new PayOS({
  clientId: env.PAYOS_CLIENT_ID,
  apiKey: env.PAYOS_API_KEY,
  checksumKey: env.PAYOS_CHECKSUM_KEY,
});

// Thời gian sống mặc định của link PayOS (phút)
const PAYOS_LINK_TTL_MINUTES = 30;

/** Tính thời điểm hết hạn của link PayOS (giây UNIX) */
const getPayOSExpiredAt = (minutes = PAYOS_LINK_TTL_MINUTES) => {
  return Math.floor((Date.now() + minutes * 60 * 1000) / 1000);
};

/** Kiểm tra link thanh toán trong DB có hoạt động/chưa hết hạn hay không */
const isPayOSLinkActive = (payment = {}) => {
  const status = String(payment?.status || "").toUpperCase();
  if (status !== "PENDING") return false;
  if (!payment?.paymentUrl) return false;
  if (!payment?.expiresAt) return true;

  const expiresAt = new Date(payment.expiresAt).getTime();
  return !Number.isNaN(expiresAt) && expiresAt > Date.now();
};

/** Tạo link thanh toán VietQR qua PayOS */
const createPayOSPaymentLink = async ({
  orderCode,
  amount,
  description,
  cancelUrl,
  returnUrl,
  buyerName,
  buyerPhone,
  expiredAt = getPayOSExpiredAt(),
}) => {
  const paymentLink = await payos.paymentRequests.create({
    orderCode,
    amount,
    description,
    cancelUrl,
    returnUrl,
    buyerName,
    buyerPhone,
    expiredAt,
  });

  if (!paymentLink?.checkoutUrl) {
    throw new ApiError(StatusCodes.BAD_GATEWAY, "PayOS không trả về checkoutUrl");
  }

  return paymentLink;
};

/** Lấy thông tin chi tiết link thanh toán từ PayOS */
const getPayOSPaymentLink = async (paymentLinkId) => {
  return await payos.paymentRequests.get(paymentLinkId);
};

/** Hủy link thanh toán PayOS đang chờ xử lý */
const cancelPayOSPaymentLink = async (paymentLinkId, cancellationReason = "Đơn hàng chuyển sang COD") => {
  return await payos.paymentRequests.cancel(paymentLinkId, cancellationReason);
};

export {
  PAYOS_LINK_TTL_MINUTES,
  cancelPayOSPaymentLink,
  createPayOSPaymentLink,
  getPayOSExpiredAt,
  getPayOSPaymentLink,
  isPayOSLinkActive,
};