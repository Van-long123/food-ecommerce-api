import Joi from 'joi'
import { ObjectId } from 'mongodb'
import { GET_DB } from '~/config/mongodb'

const ORDER_ITEM_COLLECTION_NAME = 'order_items'

const ORDER_ITEM_COLLECTION_SCHEMA = Joi.object({
  orderId: Joi.string().required().trim().strict(),
  productId: Joi.string().required().trim().strict(),
  title: Joi.string().required(),
  thumbnail: Joi.string().allow('').optional(),
  quantity: Joi.number().integer().min(1).required(),
  price: Joi.number().required(),
  totalPrice: Joi.number().required(),
  createdAt: Joi.date().timestamp('javascript').default(Date.now)
})

const validateBeforeCreate = async (data) => {
  return ORDER_ITEM_COLLECTION_SCHEMA.validateAsync(data, { abortEarly: false })
}

const createMany = async (items) => {
  try {
    const validItems = await Promise.all(items.map(item => validateBeforeCreate(item)))
    // Convert string orderId to ObjectId if necessary for queries later, 
    // but usually keeping as string is fine if that's the project pattern.
    return await GET_DB().collection(ORDER_ITEM_COLLECTION_NAME).insertMany(validItems)
  } catch (error) {
    throw new Error(error)
  }
}

const findByOrderId = async (orderId) => {
  try {
    return await GET_DB().collection(ORDER_ITEM_COLLECTION_NAME).find({
      orderId: orderId
    }).toArray()
  } catch (error) {
    throw new Error(error)
  }
}

export const orderItemModel = {
  ORDER_ITEM_COLLECTION_NAME,
  createMany,
  findByOrderId
}
