import express from 'express'
import { authMiddleware } from '~/middlewares/authMiddleware'
import { articleController } from '~/controllers/articleController'
import { articleValidation } from '~/validations/articleValidation'
import { multerUploadMiddleware } from '~/middlewares/multerUploadMiddleware'
import { PERMISSIONS } from '~/constants/permissions'

const Router = express.Router()

Router.use(authMiddleware.isAuthorized, authMiddleware.isAdmin)

const articleUpload = multerUploadMiddleware.upload.fields([
  { name: 'thumbnail', maxCount: 1 }
])

// GET  /v1/admin/articles      → Danh sách (filter, search, pagination)
// POST /v1/admin/articles      → Tạo mới (có thể kèm category_ids[])
Router.route('/')
  .get(authMiddleware.requirePermission(PERMISSIONS.ARTICLES.VIEW), articleController.getListAdmin)
  .post(
    authMiddleware.requirePermission(PERMISSIONS.ARTICLES.CREATE),
    articleUpload,
    articleValidation.createNew,
    articleController.createNew
  )

Router.route('/bulk-status')
  .put(
    authMiddleware.requirePermission(PERMISSIONS.ARTICLES.EDIT),
    articleValidation.adminBulkStatus,
    articleController.bulkUpdateStatusAdmin
  )

Router.route('/bulk')
  .delete(
    authMiddleware.requirePermission(PERMISSIONS.ARTICLES.DELETE),
    articleValidation.adminBulkDelete,
    articleController.bulkDeleteAdmin
  )

// GET    /v1/admin/articles/:id → Chi tiết (kèm primary_category + categories)
// PUT    /v1/admin/articles/:id → Cập nhật (có thể kèm category_ids[])
// DELETE /v1/admin/articles/:id → Xoá mềm (tự xoá category_articles)
Router.route('/:id')
  .get(authMiddleware.requirePermission(PERMISSIONS.ARTICLES.VIEW), articleController.getDetailAdmin)
  .put(
    authMiddleware.requirePermission(PERMISSIONS.ARTICLES.EDIT),
    articleUpload,
    articleValidation.update,
    articleController.update
  )
  .delete(authMiddleware.requirePermission(PERMISSIONS.ARTICLES.DELETE), articleController.softDelete)

// POST   /v1/admin/articles/:id/categories          → Gán vào 1 category
// DELETE /v1/admin/articles/:id/categories/:catId   → Xóa khỏi 1 category
Router.route('/:id/categories')
  .post(
    authMiddleware.requirePermission(PERMISSIONS.ARTICLES.EDIT),
    articleController.addCategory
  )

Router.route('/:id/categories/:catId')
  .delete(
    authMiddleware.requirePermission(PERMISSIONS.ARTICLES.EDIT),
    articleController.removeCategory
  )

export const adminArticleRoute = Router
