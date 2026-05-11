import Joi from 'joi'
import { GET_DB } from '~/config/mongodb'

const ORDER_COLLECTION_NAME = 'orders'

const ORDER_ITEM_SCHEMA = Joi.object({
  id: Joi.number().required(),
  title: Joi.string().required(),
  thumbnail: Joi.string().allow('').optional(),
  quantity: Joi.number().integer().min(1).required(),
  priceNew: Joi.number().required(),
  totalPrice: Joi.number().required()
})

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
  products: Joi.array().items(ORDER_ITEM_SCHEMA).min(1).required(),
  deliveryMethod: Joi.number().valid(1, 2, 3).required(),
  paymentMethod: Joi.number().valid(0, 1).required(), // 0: COD, 1: ZaloPay
  voucherCode: Joi.string().allow('', null).optional(),
  discountVoucher: Joi.number().min(0).default(0),
  shippingFee: Joi.number().min(0).default(0),
  totalPrice: Joi.number().min(0).required(),
  status: Joi.string().valid('pending', 'processing', 'shipping', 'delivered', 'cancelled').default('pending'),
  createdAt: Joi.date().timestamp('javascript').default(Date.now),
  updatedAt: Joi.date().timestamp('javascript').default(null)
})

const validateBeforeCreate = async (data) => {
  return ORDER_COLLECTION_SCHEMA.validateAsync(data, { abortEarly: false })
}

const createNew = async (data) => {
  try {
    const validData = await validateBeforeCreate(data)
    return await GET_DB().collection(ORDER_COLLECTION_NAME).insertOne(validData)
  } catch (error) {
    throw new Error(error)
  }
}

export const orderModel = {
  ORDER_COLLECTION_NAME,
  createNew
}
