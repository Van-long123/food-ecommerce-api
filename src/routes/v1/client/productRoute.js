import express from 'express'
import { productController } from '~/controllers/productController'

const Router = express.Router()

// GET /v1/client/products        → Danh sách products (active, có filter/search/page)
// GET /v1/client/products/:slug  → Chi tiết product
Router.route('/')
  .get(productController.getListClient)

Router.route('/:slug')
  .get(productController.getDetailClient)

export const clientProductRoute = Router
