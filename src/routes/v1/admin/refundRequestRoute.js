import express from "express";
import { authMiddleware } from "~/middlewares/authMiddleware";
import { multerUploadMiddleware } from "~/middlewares/multerUploadMiddleware";
import { refundRequestController } from "~/controllers/refundRequestController";
import { PERMISSIONS } from "~/constants/permissions";

const router = express.Router();

router.use(authMiddleware.isAuthorized, authMiddleware.isAdmin);

router.get(
	"/",
	authMiddleware.requirePermission(PERMISSIONS.REFUND_REQUESTS.VIEW),
	refundRequestController.getAdminRefundRequests,
);
router.get(
	"/:id",
	authMiddleware.requirePermission(PERMISSIONS.REFUND_REQUESTS.VIEW),
	refundRequestController.getAdminRefundRequestDetail,
);
router.put(
	"/:id/approve",
	authMiddleware.requirePermission(PERMISSIONS.REFUND_REQUESTS.EDIT),
	refundRequestController.approveRefundRequest,
);
router.put(
	"/:id/reject",
	authMiddleware.requirePermission(PERMISSIONS.REFUND_REQUESTS.EDIT),
	refundRequestController.rejectRefundRequest,
);
router.put(
	"/:id/complete",
	authMiddleware.requirePermission(PERMISSIONS.REFUND_REQUESTS.EDIT),
	multerUploadMiddleware.upload.single("transactionImage"),
	refundRequestController.completeRefundRequest,
);

export const adminRefundRequestRoute = router;
