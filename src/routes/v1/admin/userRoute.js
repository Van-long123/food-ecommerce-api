import express from 'express'
import { authMiddleware } from '~/middlewares/authMiddleware'
import { userController } from '~/controllers/userController'
import { userValidation } from '~/validations/userValidation'
import { multerUploadMiddleware } from '~/middlewares/multerUploadMiddleware'
import { PERMISSIONS } from '~/constants/permissions'

const Router = express.Router()

Router.use(authMiddleware.isAuthorized, authMiddleware.isAdmin)

const userUpload = multerUploadMiddleware.upload.single('avatar')

Router.route('/')
  .get(authMiddleware.requirePermission(PERMISSIONS.USERS.VIEW), userController.getListAdmin)
  .post(
    authMiddleware.requirePermission(PERMISSIONS.USERS.CREATE),
    userUpload,
    userValidation.adminCreate,
    userController.createAdmin
  )

Router.route('/bulk-status')
  .put(
    authMiddleware.requirePermission(PERMISSIONS.USERS.EDIT),
    userValidation.adminBulkStatus,
    userController.bulkUpdateStatusAdmin
  )

Router.route('/bulk')
  .delete(
    authMiddleware.requirePermission(PERMISSIONS.USERS.DELETE),
    userValidation.adminBulkDelete,
    userController.bulkDeleteAdmin
  )

Router.route('/:id')
  .get(authMiddleware.requirePermission(PERMISSIONS.USERS.VIEW), userController.getDetailAdmin)
  .put(
    authMiddleware.requirePermission(PERMISSIONS.USERS.EDIT),
    userUpload,
    userValidation.adminUpdate,
    userController.updateAdmin
  )
  .delete(authMiddleware.requirePermission(PERMISSIONS.USERS.DELETE), userController.softDeleteAdmin)

export const adminUserRoute = Router
