import Joi from 'joi'
import { ObjectId } from 'mongodb'
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
  orderIds: Joi.array().items(Joi.string()).default([]),
  status: Joi.string().valid(...Object.values(REVIEW_STATUSES)).default(REVIEW_STATUSES.APPROVED),
  createdAt: Joi.date().default(() => new Date()),
  updatedAt: Joi.date().allow(null).default(null)
  // thêm update chỉ được 1 review / product nếu đánh giá lại → update, không phải tạo mới
})

const validateBeforeCreate = async (data) => {
  return REVIEW_COLLECTION_SCHEMA.validateAsync(data, { abortEarly: false })
}

const createNew = async (data) => {
  try {
    const validData = await validateBeforeCreate(data)
    const orderIds = Array.isArray(validData.orderIds)
      ? validData.orderIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id))
      : []
    const persistData = {
      ...validData,
      productId: new ObjectId(validData.productId),
      userId: new ObjectId(validData.userId),
      orderIds
    }
    const created = await GET_DB().collection(REVIEW_COLLECTION_NAME).insertOne(persistData)
    return created
  } catch (error) {
    throw new Error(error)
  }
}

const findOneByUserAndProduct = async (productId, userId) => {
  try {
    if (!ObjectId.isValid(productId) || !ObjectId.isValid(userId)) return null

    return await GET_DB().collection(REVIEW_COLLECTION_NAME).findOne(
      {
        productId: new ObjectId(productId),
        userId: new ObjectId(userId)
      },
      {
        sort: { updatedAt: -1, createdAt: -1 }
      }
    )
  } catch (error) {
    throw new Error(error)
  }
}

const updateReview = async (reviewId, updateData, orderIdToAdd = null) => {
  try {
    if (!ObjectId.isValid(reviewId)) return null

    const updateDoc = {
      $set: {
        ...updateData,
        updatedAt: new Date()
      }
    }

    if (orderIdToAdd && ObjectId.isValid(orderIdToAdd)) {
      updateDoc.$addToSet = { orderIds: new ObjectId(orderIdToAdd) }
    }

    return await GET_DB().collection(REVIEW_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(reviewId) },
      updateDoc,
      { returnDocument: 'after' }
    )
  } catch (error) {
    throw new Error(error)
  }
}

export const reviewModel = {
  REVIEW_STATUSES,
  REVIEW_COLLECTION_NAME,
  createNew,
  findOneByUserAndProduct,
  updateReview
}
