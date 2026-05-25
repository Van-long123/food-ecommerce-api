import express from 'express'
import { authMiddleware } from '~/middlewares/authMiddleware'
import { categoryController } from '~/controllers/categoryController'
import { categoryValidation } from '~/validations/categoryValidation'
import { multerUploadMiddleware } from '~/middlewares/multerUploadMiddleware'

const Router = express.Router()

Router.use(authMiddleware.isAuthorized, authMiddleware.isAdmin)

const categoryUpload = multerUploadMiddleware.upload.fields([
  { name: 'thumbnail', maxCount: 1 },
  { name: 'bannerImage', maxCount: 1 }
])

Router.route('/')
  .get(categoryController.getListAdmin)
  .post(categoryUpload, categoryValidation.createNew, categoryController.createNew)

Router.route('/bulk-status')
  .put(categoryValidation.bulkUpdateStatus, categoryController.bulkUpdateStatusAdmin)

Router.route('/bulk')
  .delete(categoryValidation.bulkDelete, categoryController.bulkDeleteAdmin)

Router.route('/:id')
  .get(categoryController.getDetailAdmin)
  .put(categoryUpload, categoryValidation.update, categoryController.update)
  .delete(categoryController.softDelete)

export const adminCategoryRoute = Router
