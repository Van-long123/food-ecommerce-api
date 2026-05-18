import express from 'express'
import { productController } from '~/controllers/productController'
import { authMiddleware } from '~/middlewares/authMiddleware'
import { reviewValidation } from '~/validations/reviewValidation'

const Router = express.Router()

// GET /v1/client/products        → Danh sách products (active, có filter/search/page)
// GET /v1/client/products/:slug  → Chi tiết product
Router.route('/')
  .get(productController.getListClient)

Router.route('/:slug/details')
  .get(productController.getDetailClient)

Router.route('/:slug/reviews')
  .post(authMiddleware.isAuthorized, reviewValidation.createNew, productController.createReviewClient)

Router.route('/:slug/review-eligibility')
  .get(authMiddleware.isAuthorized, productController.getReviewEligibilityClient)

// GET /v1/client/products/:id/recommendations → Sản phẩm gợi ý (gọi Python microservice)
Router.route('/:id/recommendations')
  .get(productController.getRecommendations)

Router.route('/:slug')
  .get(productController.getDetailClient)

export const clientProductRoute = Router
