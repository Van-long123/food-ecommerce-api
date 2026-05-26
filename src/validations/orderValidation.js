import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import ApiError from '~/utils/ApiError'

const adminBulkStatus = async (req, res, next) => {
  const schema = Joi.object({
    order_ids: Joi.array().items(Joi.string().required()).min(1).required(),
    status: Joi.string().valid('confirmed', 'processing', 'shipping', 'delivered').required(),
  })

  try {
    await schema.validateAsync(req.body, { abortEarly: false })
    next()
  } catch (error) {
    next(new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, error.message))
  }
}

export const orderValidation = {
  adminBulkStatus,
}