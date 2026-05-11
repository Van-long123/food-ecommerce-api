import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import ApiError from '~/utils/ApiError'

const createNew = async (req, res, next) => {
  const correctCondition = Joi.object({
    username: Joi.string().required().trim(),
    address: Joi.string().required().trim(),
    phone: Joi.string().required().trim(),
    province: Joi.string().required().trim(),
    district: Joi.string().required().trim(),
    ward: Joi.string().required().trim(),
    province_id: Joi.number().required(),
    district_id: Joi.number().required(),
    ward_code: Joi.string().required(),
    default: Joi.number().valid(0, 1).default(0)
  })

  try {
    await correctCondition.validateAsync(req.body, { abortEarly: false, allowUnknown: true })
    next()
  } catch (error) {
    next(new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, error.message))
  }
}

const update = async (req, res, next) => {
  const correctCondition = Joi.object({
    username: Joi.string().optional().trim(),
    address: Joi.string().optional().trim(),
    phone: Joi.string().optional().trim(),
    province: Joi.string().optional().trim(),
    district: Joi.string().optional().trim(),
    ward: Joi.string().optional().trim(),
    province_id: Joi.number().optional(),
    district_id: Joi.number().optional(),
    ward_code: Joi.string().optional(),
    default: Joi.number().valid(0, 1).optional()
  })

  try {
    await correctCondition.validateAsync(req.body, { abortEarly: false, allowUnknown: true })
    next()
  } catch (error) {
    next(new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, error.message))
  }
}

export const addressValidation = {
  createNew,
  update
}
