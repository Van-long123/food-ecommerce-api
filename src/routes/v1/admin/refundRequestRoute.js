import express from "express";
import { authMiddleware } from "~/middlewares/authMiddleware";
import { multerUploadMiddleware } from "~/middlewares/multerUploadMiddleware";
import { refundRequestController } from "~/controllers/refundRequestController";

const router = express.Router();

router.use(authMiddleware.isAuthorized, authMiddleware.isAdmin);

router.get("/", refundRequestController.getAdminRefundRequests);
router.get("/:id", refundRequestController.getAdminRefundRequestDetail);
router.put("/:id/approve", refundRequestController.approveRefundRequest);
router.put("/:id/reject", refundRequestController.rejectRefundRequest);
router.put(
	"/:id/complete",
	multerUploadMiddleware.upload.single("transactionImage"),
	refundRequestController.completeRefundRequest,
);

export const adminRefundRequestRoute = router;
