import Joi from 'joi'
import { ObjectId } from 'mongodb'
import { GET_DB } from '~/config/mongodb'

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
  comments: Joi.array().items(
    Joi.object({
      name: Joi.string().allow('').default(''),
      avatar: Joi.string().allow('').default(''),
      content: Joi.string().required(),
      createdAt: Joi.date().default(Date.now)
    })
  ).default([]),
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
  updatedAt: Joi.date().default(null) //  xóa dùng updatedBy thôi
})

const INVALID_UPDATE_FIELDS = ['_id', 'createdBy', 'createdAt']

const validateBeforeCreate = async (data) => {
  return await ARTICLE_COLLECTION_SCHEMA.validateAsync(data, { abortEarly: false })
}

const createNew = async (data) => {
  try {
    const validData = await validateBeforeCreate(data)
    const persistData = {
      ...validData,
      primary_category_id: validData.primary_category_id ? new ObjectId(validData.primary_category_id) : null
    }
    const result = await GET_DB().collection(ARTICLE_COLLECTION_NAME).insertOne(persistData)
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
      {
        $lookup: {
          from: 'categories',
          localField: 'primary_category_id',
          foreignField: '_id',
          pipeline: [
            { $match: { deleted: false } },
            { $project: { _id: 1, title: 1, slug: 1, type: 1, thumbnail: 1 } }
          ],
          as: 'primary_category'
        }
      },
      {
        $addFields: {
          primary_category: { $arrayElemAt: ['$primary_category', 0] }
        }
      },
      {
        $lookup: {
          from: ARTICLE_COLLECTION_NAME,
          localField: 'primary_category_id',
          foreignField: 'primary_category_id',
          pipeline: [
            {
              $match: {
                deleted: false,
                status: ARTICLE_STATUSES.ACTIVE
              }
            },
            { $sort: { featured: -1, publishedAt: -1, createdAt: -1 } },
            {
              $project: {
                _id: 1,
                title: 1,
                slug: 1,
                shortDescription: 1,
                thumbnail: 1,
                publishedAt: 1,
                readTime: 1,
                views: 1
              }
            }
          ],
          as: 'relatedArticles'
        }
      },
      {
        $addFields: {
          relatedArticles: {
            $slice: [
              {
                $filter: {
                  input: '$relatedArticles',
                  as: 'relatedArticle',
                  cond: { $ne: ['$$relatedArticle._id', '$_id'] }
                }
              },
              3
            ]
          }
        }
      },
      {
        $lookup: {
          from: ARTICLE_COLLECTION_NAME,
          localField: 'deleted',
          foreignField: 'deleted',
          pipeline: [
            {
              $match: {
                deleted: false,
                status: ARTICLE_STATUSES.ACTIVE
              }
            },
            { $sort: { views: -1, publishedAt: -1, createdAt: -1 } },
            {
              $project: {
                _id: 1,
                title: 1,
                slug: 1,
                views: 1
              }
            }
          ],
          as: 'popularArticles'
        }
      },
      {
        $addFields: {
          popularArticles: {
            $slice: [
              {
                $filter: {
                  input: '$popularArticles',
                  as: 'popularArticle',
                  cond: { $ne: ['$$popularArticle._id', '$_id'] }
                }
              },
              4
            ]
          }
        }
      },
      {
        $addFields: {
          comments: { $ifNull: ['$comments', []] }
        }
      }
    ]).toArray();

    return result[0] || null;
  } catch (error) {
    throw new Error(error)
  }
}

/**
 * Danh sách articles với $facet — giống boardModel.getBoards().
 */
const getList = async ({ queryConditions = [], categoryId = null, page = 1, limit = 10, sort = { publishedAt: -1 } }) => {
  try {
    const isCategoryFilter = !!categoryId;
    const baseCollection = isCategoryFilter
      ? GET_DB().collection('category_articles')
      : GET_DB().collection(ARTICLE_COLLECTION_NAME);

    const initialPipeline = [];

    if (isCategoryFilter) {
      initialPipeline.push(
        { $match: { category_id: new ObjectId(categoryId) } },
        {
          $lookup: {
            from: ARTICLE_COLLECTION_NAME,
            localField: 'article_id',
            foreignField: '_id',
            pipeline: [
              { $match: { deleted: false } }
            ],
            as: 'article'
          }
        },
        { $unwind: '$article' },
        { $replaceRoot: { newRoot: '$article' } }
      );
    }

    const matchStage = queryConditions.length > 0 ? { $match: { $and: queryConditions } } : { $match: {} };

    const query = await baseCollection.aggregate([
      ...initialPipeline,
      matchStage,
      { $sort: sort },
      {
        $facet: {
          queryData: [
            { $skip: (page - 1) * limit },
            { $limit: limit }
          ],
          queryTotal: [{ $count: 'count' }],
          stats: [
            {
              $group: {
                _id: null,
                totalViews: { $sum: '$views' },
                authors: { $addToSet: '$authorName' }
              }
            }
          ]
        }
      }
    ]).toArray()

    const res = query[0]
    const stats = res.stats[0] || { totalViews: 0, authors: [] }
    return {
      data: res.queryData || [],
      total: res.queryTotal[0]?.count || 0,
      stats: {
        totalViews: stats.totalViews,
        totalAuthors: stats.authors.length
      }
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
    const persistUpdateData = { ...updateData }
    if (persistUpdateData.primary_category_id) {
      persistUpdateData.primary_category_id = new ObjectId(persistUpdateData.primary_category_id)
    }

    const result = await GET_DB().collection(ARTICLE_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: persistUpdateData },
      { returnDocument: 'after' }
    )
    return result
  } catch (error) {
    throw new Error(error)
  }
}

const addCommentBySlug = async (slug, commentData) => {
  try {
    const comment = {
      _id: new ObjectId(),
      name: commentData.name || '',
      avatar: commentData.avatar || '',
      content: commentData.content,
      createdAt: commentData.createdAt || new Date()
    }

    const result = await GET_DB().collection(ARTICLE_COLLECTION_NAME).findOneAndUpdate(
      {
        slug,
        deleted: false,
        status: ARTICLE_STATUSES.ACTIVE
      },
      {
        $push: {
          comments: {
            $each: [comment],
            $position: 0
          }
        },
        $set: { updatedAt: new Date() }
      },
      { returnDocument: 'after' }
    )

    return {
      article: result,
      comment
    }
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
  addCommentBySlug,
  pushUpdatedBy,
  incrementViews,
  softDelete,
  getHomeArticles
}
