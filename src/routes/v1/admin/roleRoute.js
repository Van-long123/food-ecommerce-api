import express from 'express'
import { authMiddleware } from '~/middlewares/authMiddleware'
import { roleController } from '~/controllers/roleController'
import { roleValidation } from '~/validations/roleValidation'

const Router = express.Router()

Router.use(authMiddleware.isAuthorized, authMiddleware.isAdmin)

Router.route('/')
  .get(roleController.getListAdmin)
  .post(roleValidation.createNew, roleController.createNew)
  .delete(roleController.softDeleteMany)

Router.route('/:id')
  .get(roleController.getDetailAdmin)
  .put(roleValidation.update, roleController.update)
  .delete(roleController.softDelete)

export const adminRoleRoute = Router
