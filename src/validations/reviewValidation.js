import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import ApiError from '~/utils/ApiError'

const createNew = async (req, res, next) => {
  const schema = Joi.object({
    rating: Joi.number().integer().min(1).max(5).required(),
    comment: Joi.string().allow('').max(2000).optional(),
    images: Joi.array().items(Joi.string()).max(8).optional()
  })

  try {
    await schema.validateAsync(req.body, { abortEarly: false, allowUnknown: true })
    next()
  } catch (error) {
    next(new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, error.message))
  }
}

export const reviewValidation = {
  createNew
}
