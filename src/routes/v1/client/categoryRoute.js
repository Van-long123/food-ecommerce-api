import express from 'express'
import { categoryController } from '~/controllers/categoryController'
import { categoryValidation } from '~/validations/categoryValidation'

const Router = express.Router()

// GET /v1/client/categories      → Danh sách categories (active, public)
// GET /v1/client/categories/:slug → Chi tiết category theo slug (public)
Router.route('/')
  .get(categoryController.getListClient)

Router.route('/:slug')
  .get(categoryController.getDetailClient)

export const clientCategoryRoute = Router
