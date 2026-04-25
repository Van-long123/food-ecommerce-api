import express from 'express'
import { authMiddleware } from '~/middlewares/authMiddleware'
import { articleController } from '~/controllers/articleController'
import { articleValidation } from '~/validations/articleValidation'

const Router = express.Router()

Router.use(authMiddleware.isAuthorized, authMiddleware.isAdmin)

// GET  /v1/admin/articles      → Danh sách (filter, search, pagination)
// POST /v1/admin/articles      → Tạo mới (có thể kèm category_ids[])
Router.route('/')
  .get(articleController.getListAdmin)
  .post(articleValidation.createNew, articleController.createNew)

// GET    /v1/admin/articles/:id → Chi tiết (kèm primary_category + categories)
// PUT    /v1/admin/articles/:id → Cập nhật (có thể kèm category_ids[])
// DELETE /v1/admin/articles/:id → Xoá mềm (tự xoá category_articles)
Router.route('/:id')
  .get(articleController.getDetailAdmin)
  .put(articleValidation.update, articleController.update)
  .delete(articleController.softDelete)

// POST   /v1/admin/articles/:id/categories          → Gán vào 1 category
// DELETE /v1/admin/articles/:id/categories/:catId   → Xóa khỏi 1 category
Router.route('/:id/categories')
  .post(articleController.addCategory)

Router.route('/:id/categories/:catId')
  .delete(articleController.removeCategory)

export const adminArticleRoute = Router
