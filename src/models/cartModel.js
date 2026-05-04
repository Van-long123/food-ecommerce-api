import Joi from 'joi'
import { GET_DB } from '~/config/mongodb'

const CART_COLLECTION_NAME = 'carts'

const CART_ITEM_SCHEMA = Joi.object({
  productId: Joi.string().required().trim().strict(),
  quantity: Joi.number().integer().min(1).required(),
  addedAt: Joi.date().timestamp('javascript').default(Date.now)
})

const CART_COLLECTION_SCHEMA = Joi.object({
  userId: Joi.string().required().trim().strict(),
  items: Joi.array().items(CART_ITEM_SCHEMA).default([]),
  createdAt: Joi.date().timestamp('javascript').default(Date.now),
  updatedAt: Joi.date().timestamp('javascript').default(null)
})

const validateBeforeCreate = async (data) => {
  return CART_COLLECTION_SCHEMA.validateAsync(data, { abortEarly: false })
}

const createNew = async (data) => {
  try {
    const validData = await validateBeforeCreate(data)
    return await GET_DB().collection(CART_COLLECTION_NAME).insertOne(validData)
  } catch (error) {
    throw new Error(error)
  }
}

const findByUserId = async (userId) => {
  try {
    return await GET_DB().collection(CART_COLLECTION_NAME).findOne({ userId })
  } catch (error) {
    throw new Error(error)
  }
}

const upsertItems = async (userId, items) => {
  try {
    const now = new Date()
    return await GET_DB().collection(CART_COLLECTION_NAME).findOneAndUpdate(
      { userId },
      {
        $set: { items, updatedAt: now },
        $setOnInsert: { userId, createdAt: now }
      },
      { upsert: true, returnDocument: 'after' }
    )
  } catch (error) {
    throw new Error(error)
  }
}

export const cartModel = {
  CART_COLLECTION_NAME,
  createNew,
  findByUserId,
  upsertItems
}
