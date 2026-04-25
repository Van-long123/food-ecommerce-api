import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import ApiError from '~/utils/ApiError'

const createNew = async (req, res, next) => {
  const schema = Joi.object({
    title: Joi.string().required().trim().strict(),
    slug: Joi.string().optional().trim().strict(),
    shortDescription: Joi.string().optional().allow(''),
    content: Joi.string().optional().allow(''),
    thumbnail: Joi.string().optional().allow(''),
    authorName: Joi.string().optional().allow(''),
    readTime: Joi.number().integer().min(0).optional(),
    publishedAt: Joi.date().optional().allow(null),
    status: Joi.string().valid('active', 'draft', 'inactive').optional(),
    featured: Joi.boolean().optional(),
    position: Joi.number().integer().optional(),
    primary_category_id: Joi.alternatives().try(Joi.string(), Joi.allow(null)).optional(),
    category_ids: Joi.array().items(Joi.string()).optional(),
    tags: Joi.array().items(Joi.string()).optional()
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
    shortDescription: Joi.string().optional().allow(''),
    content: Joi.string().optional().allow(''),
    thumbnail: Joi.string().optional().allow(''),
    authorName: Joi.string().optional().allow(''),
    readTime: Joi.number().integer().min(0).optional(),
    publishedAt: Joi.date().optional().allow(null),
    status: Joi.string().valid('active', 'draft', 'inactive').optional(),
    featured: Joi.boolean().optional(),
    position: Joi.number().integer().optional(),
    primary_category_id: Joi.alternatives().try(Joi.string(), Joi.allow(null)).optional(),
    category_ids: Joi.array().items(Joi.string()).optional(),
    tags: Joi.array().items(Joi.string()).optional()
  })

  try {
    await schema.validateAsync(req.body, { abortEarly: false, allowUnknown: true })
    next()
  } catch (error) {
    next(new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, error.message))
  }
}

export const articleValidation = { createNew, update }
