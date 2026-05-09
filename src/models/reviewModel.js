import Joi from 'joi'
import { GET_DB } from '~/config/mongodb'

const REVIEW_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected'
}

const REVIEW_COLLECTION_NAME = 'reviews'

const REVIEW_COLLECTION_SCHEMA = Joi.object({
  productId: Joi.string().required().trim().strict(),
  userId: Joi.string().required().trim().strict(),
  rating: Joi.number().integer().min(1).max(5).required(),
  comment: Joi.string().allow('').default(''),
  images: Joi.array().items(Joi.string()).default([]),
  status: Joi.string().valid(...Object.values(REVIEW_STATUSES)).default(REVIEW_STATUSES.APPROVED),
  createdAt: Joi.date().default(Date.now)
  // thêm update chỉ được 1 review / product nếu đánh giá lại → update, không phải tạo mới
})

const validateBeforeCreate = async (data) => {
  return REVIEW_COLLECTION_SCHEMA.validateAsync(data, { abortEarly: false })
}

const createNew = async (data) => {
  try {
    const validData = await validateBeforeCreate(data)
    const created = await GET_DB().collection(REVIEW_COLLECTION_NAME).insertOne(validData)
    return created
  } catch (error) {
    throw new Error(error)
  }
}

export const reviewModel = {
  REVIEW_STATUSES,
  REVIEW_COLLECTION_NAME,
  createNew
}
