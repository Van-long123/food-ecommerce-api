import Joi from 'joi'
import { ObjectId } from 'mongodb'
import { GET_DB } from '~/config/mongodb'
import { categoryProductModel } from './categoryProductModel'

const PRODUCT_STATUSES = {
  ACTIVE: 'active',
  INACTIVE: 'inactive'
}

const PRODUCT_UNITS = ['kg', 'g', 'hộp', 'chai', 'gói', 'túi', 'cái', 'lốc', 'combo']

const PRODUCT_COLLECTION_NAME = 'products'

const PRODUCT_COLLECTION_SCHEMA = Joi.object({
  title: Joi.string().required().trim().strict(),
  slug: Joi.string().required().trim().strict(),
  description: Joi.string().allow('').default(''),
  thumbnail: Joi.string().allow('').default(''),
  images: Joi.array().items(Joi.string()).default([]),
  stock: Joi.number().integer().min(0).default(0),
  unit: Joi.string().valid(...PRODUCT_UNITS).default('kg'),
  price: Joi.number().min(0).required(),
  discountPercentage: Joi.number().min(0).max(100).default(0),
  originalPrice: Joi.number().min(0).default(0),
  status: Joi.string().valid(...Object.values(PRODUCT_STATUSES)).default(PRODUCT_STATUSES.ACTIVE),
  featured: Joi.boolean().default(false),
  isBestPrice: Joi.boolean().default(false),
  isOnlineExclusive: Joi.boolean().default(false),
  tags: Joi.array().items(Joi.string()).default([]),
  ratings: Joi.object({
    totalRating: Joi.number().min(0).default(0),
    numberOfRatings: Joi.number().integer().min(0).default(0)
  }).default({ totalRating: 0, numberOfRatings: 0 }),
  position: Joi.number().integer().default(0),
  // Primary category (category chính, hiển thị breadcrumb / filter chính)
  primary_category_id: Joi.alternatives().try(Joi.string(), Joi.allow(null)).default(null),
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
  return await PRODUCT_COLLECTION_SCHEMA.validateAsync(data, { abortEarly: false })
}

const createNew = async (data) => {
  try {
    const validData = await validateBeforeCreate(data)
    const result = await GET_DB().collection(PRODUCT_COLLECTION_NAME).insertOne(validData)
    return result
  } catch (error) {
    throw new Error(error)
  }
}

const findOneById = async (id) => {
  try {
    return await GET_DB().collection(PRODUCT_COLLECTION_NAME).findOne({ _id: new ObjectId(id) })
  } catch (error) {
    throw new Error(error)
  }
}

const findOneBySlug = async (slug) => {
  try {
    return await GET_DB().collection(PRODUCT_COLLECTION_NAME).findOne({ slug, deleted: false })
  } catch (error) {
    throw new Error(error)
  }
}

const findOneBySlugAny = async (slug) => {
  try {
    return await GET_DB().collection(PRODUCT_COLLECTION_NAME).findOne({ slug })
  } catch (error) {
    throw new Error(error)
  }
}

/**
 * Chi tiết product kèm:
 *  - primary_category: thông tin category chính (lookup bằng primary_category_id)
 *  - categories: tất cả categories mà product thuộc về (qua category_products)
 *
 * Giống boardModel.getDetails() dùng aggregate + nhiều $lookup stage.
 */
const getDetails = async (identifier, bySlug = false) => {
  try {
    const matchCondition = bySlug
      ? { slug: identifier, deleted: false }
      : { _id: new ObjectId(identifier), deleted: false }

    const result = await GET_DB().collection(PRODUCT_COLLECTION_NAME).aggregate([
      { $match: matchCondition },
      // Lookup 1: PRIMARY CATEGORY — từ primary_category_id → categories
      {
        $lookup: {
          from: 'categories',
          let: { primaryCatId: { $toObjectId: '$primary_category_id' } },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$_id', '$$primaryCatId'] },
                deleted: false
              }
            },
            { $project: { _id: 1, title: 1, slug: 1, type: 1, thumbnail: 1 } }
          ],
          as: 'primary_category'
        }
      },
      // Flatten array → single object (null nếu không có)
      {
        $addFields: {
          primary_category: { $arrayElemAt: ['$primary_category', 0] }
        }
      },
      // Lookup 2: ALL CATEGORIES — từ category_products JOIN sang categories
      {
        $lookup: {
          from: categoryProductModel.CATEGORY_PRODUCT_COLLECTION_NAME,
          let: { productId: { $toString: '$_id' } },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$product_id', '$$productId'] },
                deleted: false
              }
            },
            { $sort: { position: 1 } },
            // Nested lookup: category_products → categories
            {
              $lookup: {
                from: 'categories',
                let: { catId: { $toObjectId: '$category_id' } },
                pipeline: [
                  {
                    $match: {
                      $expr: { $eq: ['$_id', '$$catId'] },
                      deleted: false
                    }
                  },
                  { $project: { _id: 1, title: 1, slug: 1, type: 1, thumbnail: 1 } }
                ],
                as: 'categoryInfo'
              }
            },
            { $unwind: '$categoryInfo' },
            { $replaceRoot: { newRoot: '$categoryInfo' } }
          ],
          as: 'categories'
        }
      }
    ]).toArray()

    return result[0] || null
  } catch (error) {
    throw new Error(error)
  }
}

/**
 * Danh sách products với $facet (data + count trong một query) — giống boardModel.getBoards().
 */
const getList = async ({ queryConditions = [], page = 1, limit = 10, sort = { position: 1 } }) => {
  try {
    const query = await GET_DB().collection(PRODUCT_COLLECTION_NAME).aggregate([
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
    const result = await GET_DB().collection(PRODUCT_COLLECTION_NAME).findOneAndUpdate(
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
    await GET_DB().collection(PRODUCT_COLLECTION_NAME).updateOne(
      { _id: new ObjectId(id) },
      { $push: { updatedBy: { account_id: actorId, updatedAt: new Date() } } }
    )
  } catch (error) {
    throw new Error(error)
  }
}

const softDelete = async (id, actorId) => {
  try {
    const result = await GET_DB().collection(PRODUCT_COLLECTION_NAME).findOneAndUpdate(
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

const getCampaignProducts = async ({ match = {}, sort = { createdAt: -1 }, limit = 20 }) => {
  try {
    const queryConditions = [
      { deleted: false },
      { status: PRODUCT_STATUSES.ACTIVE },
      ...Object.keys(match).map(key => ({ [key]: match[key] }))
    ]

    const result = await getList({
      queryConditions,
      page: 1,
      limit,
      sort
    })

    return result.data
  } catch (error) {
    throw new Error(error)
  }
}

/**
 * Lấy products của một category — dùng trong homeService (aggregate pipeline)
 */
const getProductsByCategory = async (categoryId, limit = 20) => {
  try {
    const categoryIdStr = categoryId.toString()

    const queryConditions = [
      { deleted: false },
      { status: PRODUCT_STATUSES.ACTIVE },
      {
        primary_category_id: new ObjectId(categoryIdStr)
      }
    ]

    const result = await getList({
      queryConditions,
      page: 1,
      limit,
      sort: { position: 1, createdAt: -1 }
    })

    return result.data
  } catch (error) {
    throw new Error(error)
  }
}

/**
 * Lấy category chi tiết kèm danh sách products của nó (qua slug)
 * Phục vụ trang danh sách sản phẩm theo category
 */
const getByCategorySlug = async (slug, limit = 20) => {
  try {
    const result = await GET_DB().collection('categories').aggregate([
      // 1. Tìm category theo slug
      { $match: { slug: slug, deleted: false, status: 'active' } },

      // 2. Lookup sang category_products để lấy danh sách product_id
      {
        $lookup: {
          from: categoryProductModel.CATEGORY_PRODUCT_COLLECTION_NAME,
          let: { catId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: [
                    {
                      $cond: [
                        { $eq: [{ $type: '$category_id' }, 'objectId'] },
                        '$category_id',
                        { $toObjectId: '$category_id' }
                      ]
                    },
                    '$$catId'
                  ]
                },
                deleted: { $ne: true }
              }
            },
            { $sort: { position: 1 } }
          ],
          as: 'product_links'
        }
      },

      // 3. Lookup sang products để lấy thông tin đầy đủ
      {
        $lookup: {
          from: PRODUCT_COLLECTION_NAME,
          let: { productIds: '$product_links.product_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $in: [
                    {
                      $cond: [
                        { $eq: [{ $type: '$_id' }, 'objectId'] },
                        { $toString: '$_id' },
                        '$_id'
                      ]
                    },
                    '$$productIds'
                  ]
                },
                deleted: false,
                status: PRODUCT_STATUSES.ACTIVE
              }
            },
            { $limit: limit }
          ],
          as: 'products'
        }
      },

      // 4. Project chỉ lấy field cần thiết
      {
        $project: {
          title: 1,
          slug: 1,
          description: 1,
          bannerImage: 1,
          badgeText: 1,
          thumbnail: 1,
          products: {
            _id: 1,
            title: 1,
            slug: 1,
            thumbnail: 1,
            price: 1,
            originalPrice: 1,
            discountPercentage: 1,
            stock: 1,
            unit: 1,
            featured: 1,
            ratings: 1
          }
        }
      }
    ]).toArray()

    return result[0] || null
  } catch (error) {
    throw new Error(error)
  }
}

export const productModel = {
  PRODUCT_STATUSES,
  PRODUCT_UNITS,
  PRODUCT_COLLECTION_NAME,
  createNew,
  findOneById,
  findOneBySlug,
  findOneBySlugAny,
  getDetails,
  getList,
  update,
  pushUpdatedBy,
  softDelete,
  getCampaignProducts,
  getProductsByCategory,
  getByCategorySlug
}
