import Joi from 'joi'
import { ObjectId } from 'mongodb'
import { GET_DB } from '~/config/mongodb'
import { categoryArticleModel } from './categoryArticleModel'

const ARTICLE_STATUSES = {
  ACTIVE: 'active',
  DRAFT: 'draft',
  INACTIVE: 'inactive'
}

const ARTICLE_COLLECTION_NAME = 'articles'

const ARTICLE_COLLECTION_SCHEMA = Joi.object({
  title: Joi.string().required().trim().strict(),
  slug: Joi.string().required().trim().strict(),
  shortDescription: Joi.string().allow('').default(''),
  content: Joi.string().allow('').default(''),
  thumbnail: Joi.string().allow('').default(''),
  authorName: Joi.string().allow('').default(''),
  readTime: Joi.number().integer().min(0).default(0),
  views: Joi.number().integer().min(0).default(0),
  publishedAt: Joi.date().default(null).allow(null),
  status: Joi.string().valid(...Object.values(ARTICLE_STATUSES)).default(ARTICLE_STATUSES.DRAFT),
  featured: Joi.boolean().default(false),
  position: Joi.number().integer().default(0),
  // Primary category (category chính của bài viết — hiển thị breadcrumb, filter)
  primary_category_id: Joi.alternatives().try(Joi.string(), Joi.allow(null)).default(null),
  tags: Joi.array().items(Joi.string()).default([]),
  deleted: Joi.boolean().default(false),
  createdBy: Joi.object({
    account_id: Joi.string().required(),
    createdAt: Joi.date().default(Date.now)
  }).required(),
  deletedBy: Joi.object({
    account_id: Joi.string(),
    deletedAt: Joi.date()
  }).allow(null).default(null),
  updatedBy: Joi.array().items(
    Joi.object({
      account_id: Joi.string(),
      updatedAt: Joi.date()
    })
  ).default([]),
  createdAt: Joi.date().default(Date.now),
  updatedAt: Joi.date().default(null)
})

const INVALID_UPDATE_FIELDS = ['_id', 'createdBy', 'createdAt']

const validateBeforeCreate = async (data) => {
  return await ARTICLE_COLLECTION_SCHEMA.validateAsync(data, { abortEarly: false })
}

const createNew = async (data) => {
  try {
    const validData = await validateBeforeCreate(data)
    const result = await GET_DB().collection(ARTICLE_COLLECTION_NAME).insertOne(validData)
    return result
  } catch (error) {
    throw new Error(error)
  }
}

const findOneById = async (id) => {
  try {
    return await GET_DB().collection(ARTICLE_COLLECTION_NAME).findOne({ _id: new ObjectId(id) })
  } catch (error) {
    throw new Error(error)
  }
}

const findOneBySlug = async (slug) => {
  try {
    return await GET_DB().collection(ARTICLE_COLLECTION_NAME).findOne({ slug, deleted: false })
  } catch (error) {
    throw new Error(error)
  }
}

const findOneBySlugAny = async (slug) => {
  try {
    return await GET_DB().collection(ARTICLE_COLLECTION_NAME).findOne({ slug })
  } catch (error) {
    throw new Error(error)
  }
}

/**
 * Chi tiết article kèm:
 *  - primary_category: category chính (lookup bằng primary_category_id)
 *  - categories: tất cả categories mà article thuộc về (qua category_articles)
 *
 * Giống boardModel.getDetails() — aggregate + nhiều $lookup stage.
 */
const getDetails = async (identifier, bySlug = false) => {
  try {
    const matchCondition = bySlug
      ? { slug: identifier, deleted: false }
      : { _id: new ObjectId(identifier), deleted: false }

    const result = await GET_DB().collection(ARTICLE_COLLECTION_NAME).aggregate([
      { $match: matchCondition },
    ]).toArray();

    return result[0] || null;
  } catch (error) {
    throw new Error(error)
  }
}

/**
 * Danh sách articles với $facet — giống boardModel.getBoards().
 */
const getList = async ({ queryConditions = [], page = 1, limit = 10, sort = { publishedAt: -1 } }) => {
  try {
    const query = await GET_DB().collection(ARTICLE_COLLECTION_NAME).aggregate([
      { $match: { $and: queryConditions } },
      { $sort: sort },
      {
        $facet: {
          queryData: [
            { $skip: (page - 1) * limit },
            { $limit: limit }
          ],
          queryTotal: [{ $count: 'count' }]
        }
      }
    ]).toArray()

    const res = query[0]
    return {
      data: res.queryData || [],
      total: res.queryTotal[0]?.count || 0
    }
  } catch (error) {
    throw new Error(error)
  }
}

const update = async (id, updateData) => {
  try {
    Object.keys(updateData).forEach(field => {
      if (INVALID_UPDATE_FIELDS.includes(field)) delete updateData[field]
    })
    const result = await GET_DB().collection(ARTICLE_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: updateData },
      { returnDocument: 'after' }
    )
    return result
  } catch (error) {
    throw new Error(error)
  }
}

const pushUpdatedBy = async (id, actorId) => {
  try {
    await GET_DB().collection(ARTICLE_COLLECTION_NAME).updateOne(
      { _id: new ObjectId(id) },
      { $push: { updatedBy: { account_id: actorId, updatedAt: new Date() } } }
    )
  } catch (error) {
    throw new Error(error)
  }
}

const incrementViews = async (id) => {
  try {
    await GET_DB().collection(ARTICLE_COLLECTION_NAME).updateOne(
      { _id: new ObjectId(id) },
      { $inc: { views: 1 } }
    )
  } catch (error) {
    throw new Error(error)
  }
}

const softDelete = async (id, actorId) => {
  try {
    const result = await GET_DB().collection(ARTICLE_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(id) },
      {
        $set: {
          deleted: true,
          updatedAt: new Date(),
          deletedBy: { account_id: actorId, deletedAt: new Date() }
        }
      },
      { returnDocument: 'after' }
    )
    return result
  } catch (error) {
    throw new Error(error)
  }
}

const getHomeArticles = async (limit = 4) => {
  try {
    return await getList({
      queryConditions: [{ deleted: false }, { status: ARTICLE_STATUSES.ACTIVE }],
      page: 1,
      limit: limit,
      sort: { publishedAt: -1 }
    })
  } catch (error) {
    throw new Error(error)
  }
}

export const articleModel = {
  ARTICLE_STATUSES,
  ARTICLE_COLLECTION_NAME,
  createNew,
  findOneById,
  findOneBySlug,
  findOneBySlugAny,
  getDetails,
  getList,
  update,
  pushUpdatedBy,
  incrementViews,
  softDelete,
  getHomeArticles
}
