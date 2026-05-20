import express from "express";
import { authMiddleware } from "~/middlewares/authMiddleware";
import { refundRequestController } from "~/controllers/refundRequestController";

const router = express.Router();

// router.use(authMiddleware.isAuthorized, authMiddleware.isAdmin);

router.put("/:id/approve", refundRequestController.approveRefundRequest);
router.put("/:id/reject", refundRequestController.rejectRefundRequest);
router.put("/:id/complete", refundRequestController.completeRefundRequest);

export const adminRefundRequestRoute = router;
