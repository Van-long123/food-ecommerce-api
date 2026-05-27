import express from 'express'
import { authMiddleware } from '~/middlewares/authMiddleware'
import { roleController } from '~/controllers/roleController'
import { roleValidation } from '~/validations/roleValidation'
import { PERMISSIONS } from '~/constants/permissions'

const Router = express.Router()

Router.use(authMiddleware.isAuthorized, authMiddleware.isAdmin)

Router.route('/')
  .get(authMiddleware.requirePermission(PERMISSIONS.ROLES.VIEW), roleController.getListAdmin)
  .post(
    authMiddleware.requirePermission(PERMISSIONS.ROLES.CREATE),
    roleValidation.createNew,
    roleController.createNew
  )
  .delete(authMiddleware.requirePermission(PERMISSIONS.ROLES.DELETE), roleController.softDeleteMany)

Router.route('/:id')
  .get(authMiddleware.requirePermission(PERMISSIONS.ROLES.VIEW), roleController.getDetailAdmin)
  .put(
    authMiddleware.requirePermission(PERMISSIONS.ROLES.EDIT),
    roleValidation.update,
    roleController.update
  )
  .delete(authMiddleware.requirePermission(PERMISSIONS.ROLES.DELETE), roleController.softDelete)

export const adminRoleRoute = Router
