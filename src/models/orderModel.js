import Joi from 'joi'
import { ObjectId } from 'mongodb'
import { GET_DB } from '~/config/mongodb'

const ORDER_COLLECTION_NAME = 'orders'

const ORDER_COLLECTION_SCHEMA = Joi.object({
  userId: Joi.string().required().trim().strict(),
  userInfo: Joi.object({
    fullname: Joi.string().required(),
    phone: Joi.string().required(),
    address: Joi.string().required(),
    ward: Joi.string().required(),
    district: Joi.string().required(),
    province: Joi.string().required(),
    note: Joi.string().allow('').optional()
  }).required(),
  voucherCode: Joi.string().allow('', null).optional(),
  discountVoucher: Joi.number().min(0).default(0),
  shippingFee: Joi.number().min(0).default(0),
  totalPrice: Joi.number().min(0).required(),
  status: Joi.string().valid('pending', 'confirmed', 'processing', 'shipping', 'delivered', 'cancelled', 'returned').default('pending'),
  createdAt: Joi.date().timestamp('javascript').default(Date.now),
  updatedAt: Joi.date().timestamp('javascript').default(null),
  updatedBy: Joi.array().items(
      Joi.object({
        account_id: Joi.string(),
        updatedAt: Joi.date()
      })
    ).default([]),
})

const validateBeforeCreate = async (data) => {
  return ORDER_COLLECTION_SCHEMA.validateAsync(data, { abortEarly: false })
}

const createNew = async (data, options = {}) => {
  try {
    const validData = await validateBeforeCreate(data)
    
    // Convert to ObjectId before saving
    const persistData = {
      ...validData,
      userId: new ObjectId(validData.userId),
      createdAt: new Date(validData.createdAt),
      updatedAt: validData.updatedAt ? new Date(validData.updatedAt) : null
    }

    return await GET_DB().collection(ORDER_COLLECTION_NAME).insertOne(persistData, options)
  } catch (error) {
    throw new Error(error)
  }
}

const findByUserId = async (userId) => {
  try {
    return await GET_DB().collection(ORDER_COLLECTION_NAME).aggregate([
      { $match: { userId: new ObjectId(userId) } },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: 'order_items',
          localField: '_id',
          foreignField: 'orderId',
          as: 'items'
        }
      },
      {
        $lookup: {
          from: 'payments',
          localField: '_id',
          foreignField: 'orderId',
          as: 'payment'
        }
      }
    ]).toArray()
  } catch (error) {
    throw new Error(error)
  }
}

const findByIdAndUserId = async (orderId, userId) => {
  try {
    const result = await GET_DB().collection(ORDER_COLLECTION_NAME).aggregate([
      { $match: { _id: new ObjectId(orderId), userId: new ObjectId(userId) } },
      {
        $lookup: {
          from: 'order_items',
          localField: '_id',
          foreignField: 'orderId',
          as: 'items'
        }
      },
      {
        $lookup: {
          from: 'payments',
          localField: '_id',
          foreignField: 'orderId',
          as: 'payment' // Use payment instead of payments since we usually expect one payment per order, though it returns array. We can get the first one in service
        }
      }
    ]).toArray()
    
    return result[0] || null
  } catch (error) {
    throw new Error(error)
  }
}

const updateStatus = async (orderId, userId, status, options = {}) => {
  try {
    return await GET_DB().collection(ORDER_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(orderId), userId: new ObjectId(userId) },
      { $set: { status, updatedAt: new Date() } },
      { returnDocument: 'after', ...options }
    )
  } catch (error) {
    throw new Error(error)
  }
}

export const orderModel = {
  ORDER_COLLECTION_NAME,
  createNew,
  findByUserId,
  findByIdAndUserId,
  updateStatus
}
