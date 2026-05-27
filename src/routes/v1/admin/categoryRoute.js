import express from 'express'
import { authMiddleware } from '~/middlewares/authMiddleware'
import { categoryController } from '~/controllers/categoryController'
import { categoryValidation } from '~/validations/categoryValidation'
import { multerUploadMiddleware } from '~/middlewares/multerUploadMiddleware'
import { PERMISSIONS } from '~/constants/permissions'

const Router = express.Router()

Router.use(authMiddleware.isAuthorized, authMiddleware.isAdmin)

const categoryUpload = multerUploadMiddleware.upload.fields([
  { name: 'thumbnail', maxCount: 1 },
  { name: 'bannerImage', maxCount: 1 }
])

Router.route('/')
  .get(authMiddleware.requirePermission(PERMISSIONS.CATEGORIES.VIEW), categoryController.getListAdmin)
  .post(
    authMiddleware.requirePermission(PERMISSIONS.CATEGORIES.CREATE),
    categoryUpload,
    categoryValidation.createNew,
    categoryController.createNew
  )

Router.route('/bulk-status')
  .put(
    authMiddleware.requirePermission(PERMISSIONS.CATEGORIES.EDIT),
    categoryValidation.bulkUpdateStatus,
    categoryController.bulkUpdateStatusAdmin
  )

Router.route('/bulk')
  .delete(
    authMiddleware.requirePermission(PERMISSIONS.CATEGORIES.DELETE),
    categoryValidation.bulkDelete,
    categoryController.bulkDeleteAdmin
  )

Router.route('/:id')
  .get(authMiddleware.requirePermission(PERMISSIONS.CATEGORIES.VIEW), categoryController.getDetailAdmin)
  .put(
    authMiddleware.requirePermission(PERMISSIONS.CATEGORIES.EDIT),
    categoryUpload,
    categoryValidation.update,
    categoryController.update
  )
  .delete(authMiddleware.requirePermission(PERMISSIONS.CATEGORIES.DELETE), categoryController.softDelete)

export const adminCategoryRoute = Router
