import express from 'express'
import { authMiddleware } from '~/middlewares/authMiddleware'
import { userController } from '~/controllers/userController'
import { userValidation } from '~/validations/userValidation'
import { multerUploadMiddleware } from '~/middlewares/multerUploadMiddleware'

const Router = express.Router()

Router.use(authMiddleware.isAuthorized, authMiddleware.isAdmin)

const userUpload = multerUploadMiddleware.upload.single('avatar')

Router.route('/')
  .get(userController.getListAdmin)
  .post(userUpload, userValidation.adminCreate, userController.createAdmin)

Router.route('/bulk-status')
  .put(userValidation.adminBulkStatus, userController.bulkUpdateStatusAdmin)

Router.route('/bulk')
  .delete(userValidation.adminBulkDelete, userController.bulkDeleteAdmin)

Router.route('/:id')
  .get(userController.getDetailAdmin)
  .put(userUpload, userValidation.adminUpdate, userController.updateAdmin)
  .delete(userController.softDeleteAdmin)

export const adminUserRoute = Router
