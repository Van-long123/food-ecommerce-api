import Joi from 'joi'
import { ObjectId } from 'mongodb'
import { GET_DB } from '~/config/mongodb'

const CHATBOT_MESSAGE_COLLECTION_NAME = 'chatbot_messages'

/**
 * Mỗi document = một session chat của một user.
 * messages[] lưu tối đa MESSAGES_LIMIT lượt để tránh prompt quá dài.
 */
const MESSAGES_LIMIT = 20 // Giới hạn số lượt giữ lại trong DB

const CHATBOT_MESSAGE_SCHEMA = Joi.object({
  // userId null = khách vãng lai (dùng sessionId làm key)
  userId: Joi.alternatives().try(Joi.string(), Joi.allow(null)).default(null),
  sessionId: Joi.string().required().trim(),
  messages: Joi.array()
    .items(
      Joi.object({
        role: Joi.string().valid('user', 'assistant').required(),
        content: Joi.string().required(),
        createdAt: Joi.date().default(() => new Date()),
      }),
    )
    .default([]),
  createdAt: Joi.date().default(() => new Date()),
  updatedAt: Joi.date().default(null),
})

const validateBeforeCreate = async (data) => {
  return CHATBOT_MESSAGE_SCHEMA.validateAsync(data, { abortEarly: false })
}

/** Tìm session theo sessionId hoặc userId */
const findSession = async ({ sessionId, userId }) => {
  try {
    const query = []
    if (userId) query.push({ userId: new ObjectId(userId) })
    if (sessionId) query.push({ sessionId })

    if (query.length === 0) return null

    return await GET_DB()
      .collection(CHATBOT_MESSAGE_COLLECTION_NAME)
      .findOne({ $or: query }, { sort: { updatedAt: -1 } })
  } catch (error) {
    throw new Error(error)
  }
}

/** Tạo session mới */
const createSession = async (data) => {
  try {
    const validData = await validateBeforeCreate(data)
    const persistData = {
      ...validData,
      userId: validData.userId ? new ObjectId(validData.userId) : null,
    }
    return await GET_DB()
      .collection(CHATBOT_MESSAGE_COLLECTION_NAME)
      .insertOne(persistData)
  } catch (error) {
    throw new Error(error)
  }
}

/**
 * Thêm tin nhắn vào session.
 * Giới hạn MESSAGES_LIMIT tin nhắn gần nhất (sliding window).
 */
const pushMessages = async ({ sessionId, userId }, newMessages = []) => {
  try {
    // Lấy session hiện tại
    const session = await findSession({ sessionId, userId })
    if (!session) return null

    const combined = [...(session.messages || []), ...newMessages]
    // Chỉ giữ lại MESSAGES_LIMIT tin nhắn gần nhất
    const trimmed = combined.slice(-MESSAGES_LIMIT)

    return await GET_DB()
      .collection(CHATBOT_MESSAGE_COLLECTION_NAME)
      .findOneAndUpdate(
        { _id: session._id },
        { $set: { messages: trimmed, updatedAt: new Date() } },
        { returnDocument: 'after' },
      )
  } catch (error) {
    throw new Error(error)
  }
}

/** Upsert session: tạo nếu chưa có, cập nhật nếu đã có */
const upsertSession = async ({ sessionId, userId = null }) => {
  try {
    const existing = await findSession({ sessionId, userId })
    if (existing) {
      // Nếu đã đăng nhập nhưng session cũ chưa có userId -> cập nhật userId vào session
      if (userId && !existing.userId) {
        await GET_DB()
          .collection(CHATBOT_MESSAGE_COLLECTION_NAME)
          .updateOne({ _id: existing._id }, { $set: { userId: new ObjectId(userId) } })
      }
      return existing
    }

    await createSession({ sessionId, userId, messages: [] })
    return await findSession({ sessionId, userId })
  } catch (error) {
    throw new Error(error)
  }
}

export const chatbotMessageModel = {
  CHATBOT_MESSAGE_COLLECTION_NAME,
  MESSAGES_LIMIT,
  findSession,
  createSession,
  pushMessages,
  upsertSession,
}
