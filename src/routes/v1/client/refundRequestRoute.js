import express from "express";
import { authMiddleware } from "~/middlewares/authMiddleware";
import { multerUploadMiddleware } from "~/middlewares/multerUploadMiddleware";
import { refundRequestController } from "~/controllers/refundRequestController";

const router = express.Router();

router.post(
  "/upload",
  authMiddleware.isAuthorized,
  multerUploadMiddleware.upload.array("evidence"),
  refundRequestController.uploadEvidence,
);

router.post(
  "/",
  authMiddleware.isAuthorized,
  multerUploadMiddleware.upload.array("evidence"),
  refundRequestController.createRefundRequest,
);

router.get(
  "/order/:orderId",
  authMiddleware.isAuthorized,
  refundRequestController.getRefundRequestByOrder,
);

router.put(
  "/:id/bank-info",
  authMiddleware.isAuthorized,
  refundRequestController.submitBankInfo,
);

export const clientRefundRequestRoute = router;
