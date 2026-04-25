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
    position: Joi.number().integer().optional(),
    parent_id: Joi.alternatives().try(Joi.string(), Joi.allow(null)).optional()
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
    position: Joi.number().integer().optional(),
    parent_id: Joi.alternatives().try(Joi.string(), Joi.allow(null)).optional()
  })

  try {
    await schema.validateAsync(req.body, { abortEarly: false, allowUnknown: true })
    next()
  } catch (error) {
    next(new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, error.message))
  }
}

export const categoryValidation = { createNew, update }
