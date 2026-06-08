import { StatusCodes } from 'http-status-codes'
import { chatbotService } from '~/services/chatbotService'

/**
 * POST /v1/client/chatbot/message
 * Body: { message, sessionId }
 * Auth: optional (isAuthorizedOptional)
 */
const sendMessage = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded ? req.jwtDecoded._id : null
    const { message, sessionId } = req.body

    const result = await chatbotService.sendMessage({ message, sessionId, userId })
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

/**
 * DELETE /v1/client/chatbot/history
 * Body: { sessionId }
 * Auth: optional
 */
const clearHistory = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded ? req.jwtDecoded._id : null
    const { sessionId } = req.body

    const result = await chatbotService.clearHistory({ sessionId, userId })
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

/**
 * GET /v1/client/chatbot/history
 * Query: sessionId
 * Auth: optional
 */
const getHistory = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded ? req.jwtDecoded._id : null
    const sessionId = req.query.sessionId

    const result = await chatbotService.getHistory({ sessionId, userId })
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

export const chatbotController = {
  sendMessage,
  clearHistory,
  getHistory,
}
