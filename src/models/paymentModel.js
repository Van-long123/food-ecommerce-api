import Joi from 'joi'
import { GET_DB } from '~/config/mongodb'

const PAYMENT_COLLECTION_NAME = 'payments'

const PAYMENT_COLLECTION_SCHEMA = Joi.object({
  orderId: Joi.string().required().trim().strict(),
  userId: Joi.string().required().trim().strict(),
  paymentMethod: Joi.string().valid('COD', 'PayOS', 'Momo').required(),
  amount: Joi.number().min(0).required(),
  currency: Joi.string().default('VND'),
  status: Joi.string().valid('pending', 'completed', 'failed', 'cancelled').default('pending'),
  
  // PayOS / Momo specific fields
  transactionId: Joi.string().allow('').optional(), // ID từ phía provider
  paymentUrl: Joi.string().allow('').optional(), // URL thanh toán (cho QR hoặc Redirect)
  rawResponse: Joi.object().optional(), // Lưu toàn bộ log từ provider trả về
  
  createdAt: Joi.date().timestamp('javascript').default(Date.now),
  updatedAt: Joi.date().timestamp('javascript').default(null)
})

const validateBeforeCreate = async (data) => {
  return PAYMENT_COLLECTION_SCHEMA.validateAsync(data, { abortEarly: false })
}

const createNew = async (data) => {
  try {
    const validData = await validateBeforeCreate(data)
    return await GET_DB().collection(PAYMENT_COLLECTION_NAME).insertOne(validData)
  } catch (error) {
    throw new Error(error)
  }
}

const updateStatus = async (paymentId, status, rawResponse = null) => {
  try {
    const updateData = {
      status,
      updatedAt: Date.now()
    }
    if (rawResponse) updateData.rawResponse = rawResponse

    return await GET_DB().collection(PAYMENT_COLLECTION_NAME).findOneAndUpdate(
      { _id: paymentId },
      { $set: updateData },
      { returnDocument: 'after' }
    )
  } catch (error) {
    throw new Error(error)
  }
}

export const paymentModel = {
  PAYMENT_COLLECTION_NAME,
  createNew,
  updateStatus
}
