import express from 'express'
import { settingsGeneralController } from '~/controllers/settingsGeneralController'
import { multerUploadMiddleware } from '~/middlewares/multerUploadMiddleware'

const Router = express.Router()

const logoUpload = multerUploadMiddleware.upload.single('logo')

// GET  /v1/admin/settings → Trả về cấu hình hiện tại (hoặc defaults nếu chưa có)
// PUT  /v1/admin/settings → Cập nhật cấu hình (hỗ trợ upload logo mới qua FormData)
Router.route('/')
  .get(settingsGeneralController.getSettings)
  .put(logoUpload, settingsGeneralController.updateSettings)

export const adminSettingsRoute = Router
