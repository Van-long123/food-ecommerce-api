import express from 'express'
import { authMiddleware } from '~/middlewares/authMiddleware'
import { multerUploadMiddleware } from '~/middlewares/multerUploadMiddleware'
import { userController } from '~/controllers/userController'
import { userValidation } from '~/validations/userValidation'
import { PERMISSIONS } from '~/constants/permissions'

const Router = express.Router()

Router.use(authMiddleware.isAuthorized)

Router.route('/')
  .put(
    authMiddleware.requirePermission(PERMISSIONS.PROFILE.EDIT),
    multerUploadMiddleware.upload.single('avatar'),
    userValidation.selfUpdateProfile,
    userController.updateSelfProfile
  )

Router.route('/password')
  .put(
    authMiddleware.requirePermission(PERMISSIONS.PROFILE.EDIT),
    userValidation.changePassword,
    userController.changePassword
  )

export const adminProfileRoute = Router