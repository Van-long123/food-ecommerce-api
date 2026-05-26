import express from 'express'
import { authMiddleware } from '~/middlewares/authMiddleware'
import { multerUploadMiddleware } from '~/middlewares/multerUploadMiddleware'
import { uploadController } from '~/controllers/uploadController'

const Router = express.Router()

Router.post(
  '/editor-image',
  authMiddleware.isAuthorized,
  authMiddleware.isAdmin,
  multerUploadMiddleware.upload.single('file'),
  uploadController.uploadEditorImage
)

export const uploadRoute = Router
