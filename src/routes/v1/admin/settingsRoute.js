import express from 'express'
import { settingsGeneralController } from '~/controllers/settingsGeneralController'
import { multerUploadMiddleware } from '~/middlewares/multerUploadMiddleware'
import { authMiddleware } from '~/middlewares/authMiddleware'
import { PERMISSIONS } from '~/constants/permissions'

const Router = express.Router()

const logoUpload = multerUploadMiddleware.upload.single('logo')

// GET  /v1/admin/settings → Trả về cấu hình hiện tại (hoặc defaults nếu chưa có)
// PUT  /v1/admin/settings → Cập nhật cấu hình (hỗ trợ upload logo mới qua FormData)
Router.route('/')
  .get(authMiddleware.requirePermission(PERMISSIONS.SETTINGS.VIEW), settingsGeneralController.getSettings)
  .put(
    authMiddleware.requirePermission(PERMISSIONS.SETTINGS.EDIT),
    logoUpload,
    settingsGeneralController.updateSettings
  )

export const adminSettingsRoute = Router
