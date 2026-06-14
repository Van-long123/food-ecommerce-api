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

// Upload ảnh review (khách hàng đã đăng nhập, tối đa 3 ảnh)
Router.post(
  '/review-images',
  authMiddleware.isAuthorized,
  multerUploadMiddleware.upload.array('images', 3),
  uploadController.uploadReviewImages
)

export const uploadRoute = Router
