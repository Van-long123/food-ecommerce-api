import { StatusCodes } from "http-status-codes";
import { CloudinaryProvider } from "~/providers/CloudinaryProvider";
import { refundRequestService } from "~/services/refundRequestService";
import ApiError from "~/utils/ApiError";

const uploadEvidence = async (req, res, next) => {
  try {
    const files = req.files || [];
    if (!files.length) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "Vui lòng chọn ít nhất một file minh chứng",
      );
    }

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

    const images = [];
    const videos = [];
    uploads.forEach((file) => {
      if (file.mimetype.startsWith("image/")) images.push(file.url);
      else if (file.mimetype.startsWith("video/")) videos.push(file.url);
    });

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Tải minh chứng thành công",
      data: { images, videos },
    });
  } catch (error) {
    next(error);
  }
};

const createRefundRequest = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id;
    const result = await refundRequestService.createRefundRequest(
      userId,
      req.body,
      req.files || [],
    );

    res.status(StatusCodes.CREATED).json({
      success: true,
      message: "Gửi yêu cầu hoàn tiền thành công",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getRefundRequestByOrder = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id;
    const orderId = req.params.orderId;
    const result = await refundRequestService.getRefundRequestByOrder(
      userId,
      orderId,
    );

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Lấy yêu cầu hoàn tiền thành công",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const submitBankInfo = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id;
    const requestId = req.params.id;
    const result = await refundRequestService.submitBankInfo(
      userId,
      requestId,
      req.body,
    );

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Cập nhật thông tin ngân hàng thành công",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const approveRefundRequest = async (req, res, next) => {
  try {
    const requestId = req.params.id;
    const result = await refundRequestService.approveRefundRequest(requestId);

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Duyệt yêu cầu hoàn tiền thành công",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const rejectRefundRequest = async (req, res, next) => {
  try {
    const requestId = req.params.id;
    const result = await refundRequestService.rejectRefundRequest(
      requestId,
      req.body?.reason,
    );

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Từ chối yêu cầu hoàn tiền thành công",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const completeRefundRequest = async (req, res, next) => {
  try {
    const requestId = req.params.id;
    let payload = req.body || {};

    if (req.file) {
      const result = await CloudinaryProvider.streamUpload(
        req.file.buffer,
        "smartfood-refund-transactions",
        req.file.mimetype,
      );
      payload = {
        ...payload,
        transactionImage: result.secure_url,
      };
    }

    const result = await refundRequestService.completeRefundRequest(
      requestId,
      payload,
    );

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Hoàn tất hoàn tiền thành công",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const getAdminRefundRequests = async (req, res, next) => {
  try {
    const {
      page,
      perPage,
      keyword,
      status,
      refundMethod,
      sortField,
      sortOrder,
    } = req.query;

    const result = await refundRequestService.getAdminRefundRequests({
      page: Number(page) || 1,
      perPage: Number(perPage) || 10,
      keyword: keyword || "",
      status: status || "",
      refundMethod: refundMethod || "",
      sortField: sortField || "createdAt",
      sortOrder: sortOrder || "desc",
    });

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Lấy danh sách yêu cầu hoàn tiền thành công",
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

const getAdminRefundRequestDetail = async (req, res, next) => {
  try {
    const requestId = req.params.id;
    const result = await refundRequestService.getAdminRefundRequestDetail(
      requestId,
    );

    res.status(StatusCodes.OK).json({
      success: true,
      message: "Lấy chi tiết yêu cầu hoàn tiền thành công",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const refundRequestController = {
  uploadEvidence,
  createRefundRequest,
  getRefundRequestByOrder,
  submitBankInfo,
  approveRefundRequest,
  rejectRefundRequest,
  completeRefundRequest,
  getAdminRefundRequests,
  getAdminRefundRequestDetail,
};
