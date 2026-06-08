import express from 'express'
import { chatbotController } from '~/controllers/chatbotController'
import { authMiddleware } from '~/middlewares/authMiddleware'

const Router = express.Router()

// POST /v1/client/chatbot/message
// Auth optional — cả khách vãng lai và user đã đăng nhập đều dùng được
Router.route('/message').post(authMiddleware.isAuthorizedOptional, chatbotController.sendMessage)

// GET /v1/client/chatbot/history
// Lấy lịch sử hội thoại
Router.route('/history').get(authMiddleware.isAuthorizedOptional, chatbotController.getHistory)

// DELETE /v1/client/chatbot/history
// Reset lịch sử hội thoại (optional auth)
Router.route('/history').delete(authMiddleware.isAuthorizedOptional, chatbotController.clearHistory)

export const chatbotRoute = Router
