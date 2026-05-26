import express from 'express'
import { authMiddleware } from '~/middlewares/authMiddleware'
import { articleController } from '~/controllers/articleController'
import { articleValidation } from '~/validations/articleValidation'
import { multerUploadMiddleware } from '~/middlewares/multerUploadMiddleware'

const Router = express.Router()

Router.use(authMiddleware.isAuthorized, authMiddleware.isAdmin)

const articleUpload = multerUploadMiddleware.upload.fields([
  { name: 'thumbnail', maxCount: 1 }
])

// GET  /v1/admin/articles      → Danh sách (filter, search, pagination)
// POST /v1/admin/articles      → Tạo mới (có thể kèm category_ids[])
Router.route('/')
  .get(articleController.getListAdmin)
  .post(articleUpload, articleValidation.createNew, articleController.createNew)

Router.route('/bulk-status')
  .put(articleValidation.adminBulkStatus, articleController.bulkUpdateStatusAdmin)

Router.route('/bulk')
  .delete(articleValidation.adminBulkDelete, articleController.bulkDeleteAdmin)

// GET    /v1/admin/articles/:id → Chi tiết (kèm primary_category + categories)
// PUT    /v1/admin/articles/:id → Cập nhật (có thể kèm category_ids[])
// DELETE /v1/admin/articles/:id → Xoá mềm (tự xoá category_articles)
Router.route('/:id')
  .get(articleController.getDetailAdmin)
  .put(articleUpload, articleValidation.update, articleController.update)
  .delete(articleController.softDelete)

// POST   /v1/admin/articles/:id/categories          → Gán vào 1 category
// DELETE /v1/admin/articles/:id/categories/:catId   → Xóa khỏi 1 category
Router.route('/:id/categories')
  .post(articleController.addCategory)

Router.route('/:id/categories/:catId')
  .delete(articleController.removeCategory)

export const adminArticleRoute = Router
