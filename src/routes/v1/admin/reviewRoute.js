import express from 'express'
import { authMiddleware } from '~/middlewares/authMiddleware'
import { reviewController } from '~/controllers/reviewController'
import { PERMISSIONS } from '~/constants/permissions'

const Router = express.Router()

Router.use(authMiddleware.isAuthorized, authMiddleware.isAdmin)

// GET  /v1/admin/reviews        → Danh sách (filter, search, pagination)
// GET  /v1/admin/reviews/:id    → Chi tiết đánh giá
// PUT  /v1/admin/reviews/:id/status → Cập nhật trạng thái
Router.route('/')
  .get(authMiddleware.requirePermission(PERMISSIONS.REVIEWS.VIEW), reviewController.getListAdmin)

Router.route('/:id')
  .get(authMiddleware.requirePermission(PERMISSIONS.REVIEWS.VIEW), reviewController.getDetailAdmin)

Router.route('/:id/status')
  .put(authMiddleware.requirePermission(PERMISSIONS.REVIEWS.EDIT), reviewController.updateStatusAdmin)

export const adminReviewRoute = Router
