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
  createdAt: Joi.date().default(() => new Date())
})

const validateBeforeCreate = async (data) => {
  return ORDER_ITEM_COLLECTION_SCHEMA.validateAsync(data, { abortEarly: false })
}

const createMany = async (items, options = {}) => {
  try {
    const validItems = await Promise.all(items.map(item => validateBeforeCreate(item)))
    
    // Convert to ObjectId and Date before saving
    const persistItems = validItems.map(item => ({
      ...item,
      orderId: new ObjectId(item.orderId),
      productId: new ObjectId(item.productId),
      createdAt: new Date(item.createdAt)
    }))

    return await GET_DB().collection(ORDER_ITEM_COLLECTION_NAME).insertMany(persistItems, options)
  } catch (error) {
    throw new Error(error)
  }
}

const findByOrderId = async (orderId) => {
  try {
    return await GET_DB().collection(ORDER_ITEM_COLLECTION_NAME).find({
      orderId: new ObjectId(orderId)
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
