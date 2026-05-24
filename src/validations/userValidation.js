import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import ApiError from '~/utils/ApiError'
import { EMAIL_RULE, EMAIL_RULE_MESSAGE, PASSWORD_RULE, PASSWORD_RULE_MESSAGE } from '~/utils/validators'

const createNew = async (req, res, next) => {
  const correctCondition = Joi.object({
    email: Joi.string().required().pattern(EMAIL_RULE).message(EMAIL_RULE_MESSAGE),
    password: Joi.string().required().pattern(PASSWORD_RULE).message(PASSWORD_RULE_MESSAGE),
    phone: Joi.string().required().trim().strict(),
    displayName: Joi.string().required().trim().strict()
  })

  try {
    await correctCondition.validateAsync(req.body, { abortEarly: false, allowUnknown: true })
    next()
  } catch (error) {
    next(new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, error.message))
  }
}

const verifyAccount = async (req, res, next) => {
  const correctCondition = Joi.object({
    email: Joi.string().required().pattern(EMAIL_RULE).message(EMAIL_RULE_MESSAGE),
    token: Joi.string().required()
  })

  try {
    await correctCondition.validateAsync(req.body, { abortEarly: false, allowUnknown: true })
    next()
  } catch (error) {
    next(new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, error.message))
  }
}

const login = async (req, res, next) => {
  const correctCondition = Joi.object({
    email: Joi.string().required().pattern(EMAIL_RULE).message(EMAIL_RULE_MESSAGE),
    password: Joi.string().required().pattern(PASSWORD_RULE).message(PASSWORD_RULE_MESSAGE)
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
    displayName: Joi.string().optional().trim().strict(),
    phone: Joi.string().optional().trim().strict(),
    avatar: Joi.string().optional().allow(''),
    role: Joi.string().optional().valid('client', 'admin'),
    address: Joi.string().optional().allow(''),
    gender: Joi.string().optional().allow(''),
    birthday: Joi.string().optional().allow(''),
    current_password: Joi.string().optional().pattern(PASSWORD_RULE).message(PASSWORD_RULE_MESSAGE),
    new_password: Joi.string().optional().pattern(PASSWORD_RULE).message(PASSWORD_RULE_MESSAGE)
  })

  try {
    await correctCondition.validateAsync(req.body, { abortEarly: false, allowUnknown: true })
    next()
  } catch (error) {
    next(new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, error.message))
  }
}

const forgotPassword = async (req, res, next) => {
  const correctCondition = Joi.object({
    email: Joi.string().required().pattern(EMAIL_RULE).message(EMAIL_RULE_MESSAGE)
  })

  try {
    await correctCondition.validateAsync(req.body, { abortEarly: false, allowUnknown: true })
    next()
  } catch (error) {
    next(new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, error.message))
  }
}

const resetPassword = async (req, res, next) => {
  const correctCondition = Joi.object({
    email: Joi.string().required().pattern(EMAIL_RULE).message(EMAIL_RULE_MESSAGE),
    token: Joi.string().required(),
    newPassword: Joi.string().required().pattern(PASSWORD_RULE).message(PASSWORD_RULE_MESSAGE)
  })

  try {
    await correctCondition.validateAsync(req.body, { abortEarly: false, allowUnknown: true })
    next()
  } catch (error) {
    next(new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, error.message))
  }
}

const setPassword = async (req, res, next) => {
  const correctCondition = Joi.object({
    token: Joi.string().required(),
    newPassword: Joi.string().required().pattern(PASSWORD_RULE).message(PASSWORD_RULE_MESSAGE)
  })

  try {
    await correctCondition.validateAsync(req.body, { abortEarly: false, allowUnknown: true })
    next()
  } catch (error) {
    next(new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, error.message))
  }
}

// ─── ADMIN ────────────────────────────────────────────────────────────────
const adminCreate = async (req, res, next) => {
  const schema = Joi.object({
    email: Joi.string().required().pattern(EMAIL_RULE).message(EMAIL_RULE_MESSAGE),
    displayName: Joi.string().required().trim().strict(),
    phone: Joi.string().required().trim().strict(),
    avatar: Joi.string().optional().allow(''),
    role: Joi.string().optional().valid('admin', 'client'),
    roleId: Joi.string().optional().allow(null, ''),
    address: Joi.string().optional().allow(''),
    gender: Joi.string().optional().allow(''),
    birthday: Joi.string().optional().allow(''),
    isActive: Joi.boolean().optional()
  })

  try {
    await schema.validateAsync(req.body, { abortEarly: false, allowUnknown: true })
    next()
  } catch (error) {
    next(new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, error.message))
  }
}

const adminUpdate = async (req, res, next) => {
  const schema = Joi.object({
    displayName: Joi.string().optional().trim().strict(),
    phone: Joi.string().optional().trim().strict(),
    avatar: Joi.string().optional().allow(''),
    role: Joi.string().optional().valid('admin', 'client'),
    roleId: Joi.string().optional().allow(null, ''),
    address: Joi.string().optional().allow(''),
    gender: Joi.string().optional().allow(''),
    birthday: Joi.string().optional().allow(''),
    isActive: Joi.boolean().optional()
  })

  try {
    await schema.validateAsync(req.body, { abortEarly: false, allowUnknown: true })
    next()
  } catch (error) {
    next(new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, error.message))
  }
}

const adminBulkStatus = async (req, res, next) => {
  const schema = Joi.object({
    user_ids: Joi.array().items(Joi.string()).min(1).required(),
    isActive: Joi.boolean().required()
  })

  try {
    await schema.validateAsync(req.body, { abortEarly: false, allowUnknown: true })
    next()
  } catch (error) {
    next(new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, error.message))
  }
}

const adminBulkDelete = async (req, res, next) => {
  const schema = Joi.object({
    user_ids: Joi.array().items(Joi.string()).min(1).required()
  })

  try {
    await schema.validateAsync(req.body, { abortEarly: false, allowUnknown: true })
    next()
  } catch (error) {
    next(new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, error.message))
  }
}

export const userValidation = {
  createNew,
  verifyAccount,
  login,
  update,
  forgotPassword,
  resetPassword,
  setPassword,
  adminCreate,
  adminUpdate,
  adminBulkStatus,
  adminBulkDelete
}
