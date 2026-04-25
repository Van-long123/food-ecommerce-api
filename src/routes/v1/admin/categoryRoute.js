import express from 'express'
import { authMiddleware } from '~/middlewares/authMiddleware'
import { categoryController } from '~/controllers/categoryController'
import { categoryValidation } from '~/validations/categoryValidation'

const Router = express.Router()

// Áp dụng auth + isAdmin cho toàn bộ admin category routes
Router.use(authMiddleware.isAuthorized, authMiddleware.isAdmin)

// GET    /v1/admin/categories      → Danh sách (có filter, sort, pagination)
// POST   /v1/admin/categories      → Tạo mới
Router.route('/')
  .get(categoryController.getListAdmin)
  .post(categoryValidation.createNew, categoryController.createNew)

// GET    /v1/admin/categories/:id  → Chi tiết
// PUT    /v1/admin/categories/:id  → Cập nhật
// DELETE /v1/admin/categories/:id  → Xoá mềm
Router.route('/:id')
  .get(categoryController.getDetailAdmin)
  .put(categoryValidation.update, categoryController.update)
  .delete(categoryController.softDelete)

export const adminCategoryRoute = Router
