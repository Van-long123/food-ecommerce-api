import express from 'express'
import { authMiddleware } from '~/middlewares/authMiddleware'
import { reviewController } from '~/controllers/reviewController'

const Router = express.Router()

Router.use(authMiddleware.isAuthorized, authMiddleware.isAdmin)

// GET  /v1/admin/reviews        → Danh sách (filter, search, pagination)
// GET  /v1/admin/reviews/:id    → Chi tiết đánh giá
// PUT  /v1/admin/reviews/:id/status → Cập nhật trạng thái
Router.route('/')
  .get(reviewController.getListAdmin)

Router.route('/:id')
  .get(reviewController.getDetailAdmin)

Router.route('/:id/status')
  .put(reviewController.updateStatusAdmin)

export const adminReviewRoute = Router
