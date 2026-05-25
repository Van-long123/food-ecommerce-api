import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import ApiError from '~/utils/ApiError'
import { voucherModel } from '~/models/voucherModel'

const baseSchema = {
  code: Joi.string().uppercase().trim(),
  name: Joi.string().trim(),
  description: Joi.string().allow('').default(''),
  type: Joi.string().valid(...Object.values(voucherModel.VOUCHER_TYPES)),
  discountValue: Joi.number().min(0),
  maxDiscountAmount: Joi.number().min(0).allow(null).default(null),
  minOrderValue: Joi.number().min(0).default(0),
  applyFor: Joi.string().valid(...Object.values(voucherModel.VOUCHER_APPLY_FOR)),
  applyForIds: Joi.array().items(Joi.string()).default([]),
  startDate: Joi.date(),
  endDate: Joi.date(),
  status: Joi.string().valid(...Object.values(voucherModel.VOUCHER_STATUSES)),
  quantity: Joi.number().integer().min(0),
  usageLimitPerUser: Joi.number().integer().min(1).default(1),
  isFeatured: Joi.boolean().default(false),
}

const validateBody = async (schema, req, next) => {
  try {
    await schema.validateAsync(req.body, {
      abortEarly: false,
      allowUnknown: true,
    })
    next()
  } catch (error) {
    next(new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, error.message))
  }
}

const createNew = async (req, res, next) => {
  const schema = Joi.object({
    ...baseSchema,
    code: baseSchema.code.required(),
    name: baseSchema.name.required(),
    type: baseSchema.type.required(),
    discountValue: baseSchema.discountValue.required(),
    startDate: baseSchema.startDate.required(),
    endDate: baseSchema.endDate.required(),
    quantity: baseSchema.quantity.required(),
  })

  return validateBody(schema, req, next)
}

const update = async (req, res, next) => {
  const schema = Joi.object(baseSchema).min(1)
  return validateBody(schema, req, next)
}

const adminBulkStatus = async (req, res, next) => {
  const schema = Joi.object({
    voucher_ids: Joi.array().items(Joi.string().required()).min(1).required(),
    status: Joi.string().valid(
      voucherModel.VOUCHER_STATUSES.ACTIVE,
      voucherModel.VOUCHER_STATUSES.INACTIVE,
    ).required(),
  })

  return validateBody(schema, req, next)
}

const adminBulkDelete = async (req, res, next) => {
  const schema = Joi.object({
    voucher_ids: Joi.array().items(Joi.string().required()).min(1).required(),
  })

  return validateBody(schema, req, next)
}

export const voucherValidation = {
  createNew,
  update,
  adminBulkStatus,
  adminBulkDelete,
}