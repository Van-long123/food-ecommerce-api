import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import ApiError from '~/utils/ApiError'

const createNew = async (req, res, next) => {
  const schema = Joi.object({
    title: Joi.string().required().trim().strict(),
    slug: Joi.string().optional().trim().strict(),
    type: Joi.string().valid('product', 'article').required(),
    description: Joi.string().optional().allow(''),
    thumbnail: Joi.string().optional().allow(''),
    bannerImage: Joi.string().optional().allow(''),
    badgeText: Joi.string().optional().allow(''),
    status: Joi.string().valid('active', 'inactive').optional(),
    featured: Joi.boolean().optional(),
    position: Joi.alternatives().try(Joi.number().integer(), Joi.string().allow(''), Joi.allow(null)).optional(),
    parent_id: Joi.alternatives().try(Joi.string().allow(''), Joi.allow(null)).optional()
  })

  try {
    await schema.validateAsync(req.body, { abortEarly: false, allowUnknown: true })
    next()
  } catch (error) {
    next(new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, error.message))
  }
}

const update = async (req, res, next) => {
  const schema = Joi.object({
    title: Joi.string().optional().trim().strict(),
    slug: Joi.string().optional().trim().strict(),
    type: Joi.string().valid('product', 'article').optional(),
    description: Joi.string().optional().allow(''),
    thumbnail: Joi.string().optional().allow(''),
    bannerImage: Joi.string().optional().allow(''),
    badgeText: Joi.string().optional().allow(''),
    status: Joi.string().valid('active', 'inactive').optional(),
    featured: Joi.boolean().optional(),
    position: Joi.alternatives().try(Joi.number().integer(), Joi.string().allow(''), Joi.allow(null)).optional(),
    parent_id: Joi.alternatives().try(Joi.string().allow(''), Joi.allow(null)).optional()
  })

  try {
    await schema.validateAsync(req.body, { abortEarly: false, allowUnknown: true })
    next()
  } catch (error) {
    next(new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, error.message))
  }
}

const bulkUpdateStatus = async (req, res, next) => {
  const schema = Joi.object({
    category_ids: Joi.array().items(Joi.string().required()).min(1).required(),
    status: Joi.string().valid('active', 'inactive').required(),
  })

  try {
    await schema.validateAsync(req.body, { abortEarly: false })
    next()
  } catch (error) {
    next(new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, error.message))
  }
}

const bulkDelete = async (req, res, next) => {
  const schema = Joi.object({
    category_ids: Joi.array().items(Joi.string().required()).min(1).required(),
  })

  try {
    await schema.validateAsync(req.body, { abortEarly: false })
    next()
  } catch (error) {
    next(new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, error.message))
  }
}

export const categoryValidation = { createNew, update, bulkUpdateStatus, bulkDelete }
