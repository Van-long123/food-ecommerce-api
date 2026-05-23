import express from 'express'
import { settingsGeneralController } from '~/controllers/settingsGeneralController'

const Router = express.Router()

// GET /v1/client/settings → Trả về cấu hình chung, không yêu cầu xác thực
Router.route('/').get(settingsGeneralController.getSettings)

export const clientSettingsRoute = Router
