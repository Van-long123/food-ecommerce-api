import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import ApiError from '~/utils/ApiError'

const cartItemSchema = Joi.object({
  productId: Joi.string().required().trim().strict(),
  quantity: Joi.number().integer().min(1).required()
})

const addItem = async (req, res, next) => {
  const correctCondition = Joi.object({
    productId: Joi.string().required().trim().strict(),
    quantity: Joi.number().integer().min(1).required()
  })

  try {
    await correctCondition.validateAsync(req.body, { abortEarly: false, allowUnknown: true })
    next()
  } catch (error) {
    next(new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, error.message))
  }
}

const updateItem = async (req, res, next) => {
  const correctCondition = Joi.object({
    quantity: Joi.number().integer().min(0).required()
  })

  try {
    await correctCondition.validateAsync(req.body, { abortEarly: false, allowUnknown: true })
    next()
  } catch (error) {
    next(new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, error.message))
  }
}

const removeItems = async (req, res, next) => {
  const correctCondition = Joi.object({
    productIds: Joi.array().items(Joi.string().trim().strict()).min(1).required()
  })

  try {
    await correctCondition.validateAsync(req.body, { abortEarly: false, allowUnknown: true })
    next()
  } catch (error) {
    next(new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, error.message))
  }
}

const mergeGuestCart = async (req, res, next) => {
  const correctCondition = Joi.object({
    items: Joi.array().items(cartItemSchema).default([])
  })

  try {
    await correctCondition.validateAsync(req.body, { abortEarly: false, allowUnknown: true })
    next()
  } catch (error) {
    next(new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, error.message))
  }
}

const validateGuestCart = async (req, res, next) => {
  const correctCondition = Joi.object({
    items: Joi.array().items(cartItemSchema).default([])
  })

  try {
    await correctCondition.validateAsync(req.body, { abortEarly: false, allowUnknown: true })
    next()
  } catch (error) {
    next(new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, error.message))
  }
}

export const cartValidation = {
  addItem,
  updateItem,
  removeItems,
  mergeGuestCart,
  validateGuestCart
}
