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
    const persistData = {
      ...validData,
      primary_category_id: validData.primary_category_id ? new ObjectId(validData.primary_category_id) : null,
      createdAt: new Date(validData.createdAt),
      updatedAt: validData.updatedAt ? new Date(validData.updatedAt) : null
    }
    const result = await GET_DB().collection(PRODUCT_COLLECTION_NAME).insertOne(persistData)
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

const findManyByIds = async (ids = []) => {
  try {
    const objectIds = ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id))
    if (!objectIds.length) return []

    return await GET_DB()
      .collection(PRODUCT_COLLECTION_NAME)
      .find({ _id: { $in: objectIds } })
      .toArray()
  } catch (error) {
    throw new Error(error)
  }
}

const decreaseStockIfAvailable = async (productId, quantity, options = {}) => {
  try {
    const qty = Math.max(1, Number(quantity || 0))
    if (!ObjectId.isValid(productId) || qty <= 0) return { matchedCount: 0, modifiedCount: 0 }

    return await GET_DB().collection(PRODUCT_COLLECTION_NAME).updateOne(
      {
        _id: new ObjectId(productId),
        deleted: false,
        status: PRODUCT_STATUSES.ACTIVE,
        stock: { $gte: qty }
      },
      { $inc: { stock: -qty } },
      options
    )
  } catch (error) {
    throw new Error(error)
  }
}

const increaseStock = async (productId, quantity, options = {}) => {
  try {
    const qty = Math.max(1, Number(quantity || 0))
    if (!ObjectId.isValid(productId) || qty <= 0) return { matchedCount: 0, modifiedCount: 0 }

    return await GET_DB().collection(PRODUCT_COLLECTION_NAME).updateOne(
      { _id: new ObjectId(productId) },
      { $inc: { stock: qty } },
      options
    )
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
const getDetails = async (identifier) => {
  try {
    const identifierStr = String(identifier || '').trim()
    const matchCondition = ObjectId.isValid(identifierStr)
      ? {
          deleted: false,
          $or: [{ _id: new ObjectId(identifierStr) }, { slug: identifierStr }]
        }
      : { slug: identifierStr, deleted: false }

    const result = await GET_DB().collection(PRODUCT_COLLECTION_NAME).aggregate([
      { $match: matchCondition },

      // Lookup 1: PRIMARY CATEGORY — JOIN trực tiếp bằng ObjectId
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

      // Lookup 2: ALL CATEGORIES — JOIN từ Product sang bảng trung gian category_products
      // {
      //   $lookup: {
      //     from: categoryProductModel.CATEGORY_PRODUCT_COLLECTION_NAME,
      //     localField: '_id',
      //     foreignField: 'product_id',
      //     pipeline: [
      //       { $match: { deleted: false } },
      //       { $sort: { position: 1 } },
      //       // Nested lookup: JOIN từ bảng trung gian sang Categories
      //       {
      //         $lookup: {
      //           from: 'categories',
      //           localField: 'category_id',
      //           foreignField: '_id',
      //           pipeline: [
      //             { $match: { deleted: false } },
      //             { $project: { _id: 1, title: 1, slug: 1, type: 1, thumbnail: 1 } }
      //           ],
      //           as: 'categoryInfo'
      //         }
      //       },
      //       { $unwind: '$categoryInfo' },
      //       { $replaceRoot: { newRoot: '$categoryInfo' } }
      //     ],
      //     as: 'categories'
      //   }
      // },

      // Lookup 3: REVIEWS
      {
        $lookup: {
          from: 'reviews',
          localField: '_id',
          foreignField: 'productId',
          pipeline: [
            { $match: { status: 'approved' } },
            { $sort: { createdAt: -1 } },
            // Lookup thông tin user đánh giá
            {
              $lookup: {
                from: 'users',
                localField: 'userId',
                foreignField: '_id',
                pipeline: [
                  { $project: { _id: 1, displayName: 1, avatar: 1 } }
                ],
                as: 'user'
              }
            },
            {
              $addFields: {
                user: { $arrayElemAt: ['$user', 0] }
              }
            },
            {
              $project: {
                _id: 1, productId: 1, userId: 1, rating: 1, comment: 1,
                images: 1, status: 1, createdAt: 1,
                user: { _id: 1, displayName: 1, avatar: 1 }
              }
            }
          ],
          as: 'reviews'
        }
      },


    ]).toArray()
// ... (matchCondition giữ nguyên)

// const result = await GET_DB().collection(PRODUCT_COLLECTION_NAME).aggregate([
//   { $match: matchCondition },

//   // 1. PRIMARY CATEGORY (Giữ nguyên localField vì cùng là ObjectId)
//   {
//     $lookup: {
//       from: 'categories',
//       localField: 'primary_category_id',
//       foreignField: '_id',
//       pipeline: [
//         { $match: { deleted: false } },
//         { $project: { _id: 1, title: 1, slug: 1, type: 1, thumbnail: 1 } }
//       ],
//       as: 'primary_category'
//     }
//   },
//   { $addFields: { primary_category: { $arrayElemAt: ['$primary_category', 0] } } },

//   // 2. ALL CATEGORIES (Bắt buộc dùng let + $toString vì product_id là String)
//   {
//     $lookup: {
//       from: categoryProductModel.CATEGORY_PRODUCT_COLLECTION_NAME,
//       let: { productId: { $toString: '$_id' } }, // Chuyển ObjectId thành String
//       pipeline: [
//         {
//           $match: {
//             $expr: { $eq: ['$product_id', '$$productId'] },
//             deleted: false
//           }
//         },
//         { $sort: { position: 1 } },
//         {
//           $lookup: {
//             from: 'categories',
//             let: { catId: { $toObjectId: '$category_id' } },
//             pipeline: [
//               { $match: { $expr: { $eq: ['$_id', '$$catId'] }, deleted: false } },
//               { $project: { _id: 1, title: 1, slug: 1, type: 1, thumbnail: 1 } }
//             ],
//             as: 'categoryInfo'
//           }
//         },
//         { $unwind: '$categoryInfo' },
//         { $replaceRoot: { newRoot: '$categoryInfo' } }
//       ],
//       as: 'categories'
//     }
//   },

//   // 3. REVIEWS (Bắt buộc dùng let + $toString vì productId trong Review là String)
//   {
//     $lookup: {
//       from: 'reviews',
//       let: { productId: { $toString: '$_id' } }, // Chuyển ObjectId thành String
//       pipeline: [
//         {
//           $match: {
//             $expr: {
//               $and: [
//                 { $eq: ['$productId', '$$productId'] }, // So sánh String với String
//                 { $eq: ['$status', 'approved'] }
//               ]
//             }
//           }
//         },
//         { $sort: { createdAt: -1 } },
//         {
//           $lookup: {
//             from: 'users',
//             let: { reviewUserId: { $toObjectId: '$userId' } }, // Ép kiểu nếu userId là String
//             pipeline: [
//               { $match: { $expr: { $eq: ['$_id', '$$reviewUserId'] } } },
//               { $project: { _id: 1, displayName: 1, avatar: 1 } }
//             ],
//             as: 'user'
//           }
//         },
//         { $addFields: { user: { $arrayElemAt: ['$user', 0] } } },
//         {
//           $project: {
//             _id: 1, productId: 1, userId: 1, rating: 1, comment: 1,
//             images: 1, status: 1, createdAt: 1,
//             user: { _id: 1, displayName: 1, avatar: 1 }
//           }
//         }
//       ],
//       as: 'reviews'
//     }
//   },

//   // ... (Phần ratingSummary và Suggestions giữ nguyên như cũ)
// ]).toArray();


    const product = result[0] || null
    if (product) {
      const reviews = product.reviews || []
      const totalRating = product.ratings?.totalRating || 0
      const numberOfRatings = product.ratings?.numberOfRatings || 0

      product.ratingSummary = {
        totalReviews: reviews.length,
        averageRating: numberOfRatings > 0 ? Number((totalRating / numberOfRatings).toFixed(1)) : 0,
        distribution: [1, 2, 3, 4, 5].map(star => ({
          star,
          count: reviews.filter(r => r.rating === star).length
        }))
      }
    }

    return product
  } catch (error) {
    throw new Error(error)
  }
}

const syncRatingsFromReviews = async (productId) => {
  try {
    const productIdStr = productId.toString()

    const summary = await GET_DB().collection('reviews').aggregate([
      {
        $match: {
          productId: new ObjectId(productIdStr),
          status: 'approved'
        }
      },
      {
        $group: {
          _id: null,
          totalRating: { $sum: '$rating' },
          numberOfRatings: { $sum: 1 }
        }
      }
    ]).toArray()

    const totalRating = summary[0]?.totalRating || 0
    const numberOfRatings = summary[0]?.numberOfRatings || 0

    await GET_DB().collection(PRODUCT_COLLECTION_NAME).updateOne(
      { _id: new ObjectId(productIdStr) },
      {
        $set: {
          ratings: {
            totalRating,
            numberOfRatings
          },
          updatedAt: new Date()
        }
      }
    )

    return {
      totalRating,
      numberOfRatings,
      averageRating: numberOfRatings > 0 ? Number((totalRating / numberOfRatings).toFixed(1)) : 0
    }
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
    const persistUpdateData = { ...updateData }
    if (persistUpdateData.primary_category_id) {
      persistUpdateData.primary_category_id = new ObjectId(persistUpdateData.primary_category_id)
    }

    const result = await GET_DB().collection(PRODUCT_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: persistUpdateData },
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

const getPaginatedCampaignProducts = async ({ match = {}, sort = { createdAt: -1 }, limit = 20, page = 1 }) => {
  try {
    const queryConditions = [
      { deleted: false },
      { status: PRODUCT_STATUSES.ACTIVE },
      ...Object.keys(match).map(key => ({ [key]: match[key] }))
    ]

    const result = await getList({
      queryConditions,
      page,
      limit,
      sort
    })

    return result
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
 * [Category Page]
 */
const getListByPrimaryCategory = async ({
  categoryId,
  page = 1,
  limit = 10,
  filter = 'all',
  sortBy = 'popular',
  minPrice = null,
  maxPrice = null,
  brands = [],
  newWithinDays = 30
} = {}) => {
  try {

    const sanitizedPage = Number.isFinite(page) && page > 0 ? page : 1
    const sanitizedLimit = Number.isFinite(limit) && limit > 0 ? limit : 10

    const priceMatch = {}
    const minPriceNumber = typeof minPrice === 'number' && Number.isFinite(minPrice) ? minPrice : null
    const maxPriceNumber = typeof maxPrice === 'number' && Number.isFinite(maxPrice) ? maxPrice : null
    if (minPriceNumber !== null) priceMatch.$gte = minPriceNumber
    if (maxPriceNumber !== null) priceMatch.$lte = maxPriceNumber

    const normalizedBrands = Array.isArray(brands)
      ? brands.map((b) => String(b || '').trim()).filter(Boolean)
      : []

    const filterStages = []

    // Filter chip mapping
    if (filter === 'best') {
      filterStages.push({ $match: { featured: true } })
    }
    if (filter === 'discount') {
      filterStages.push({ $match: { discountPercentage: { $gt: 0 } } })
    }

    if (Object.keys(priceMatch).length) {
      filterStages.push({ $match: { price: priceMatch } })
    }
    if (normalizedBrands.length) {
      filterStages.push({
        $match: {
          $or: [
            { brand: { $in: normalizedBrands } },
            { tags: { $elemMatch: { $in: normalizedBrands } } }
          ]
        }
      })
    }

    const sortStage = (() => {
      if (sortBy === 'priceAsc') return { $sort: { 'product.price': 1, 'product.createdAt': -1 } }
      if (sortBy === 'priceDesc') return { $sort: { 'product.price': -1, 'product.createdAt': -1 } }
      if (sortBy === 'discountDesc') return { $sort: { 'product.discountPercentage': -1, 'product.position': 1, 'product.createdAt': -1 } }

      return {
        $sort: {
          // '_productSold': -1,
          'product.featured': -1,
          'product.position': 1,
          'product.createdAt': -1
        }
      }
    })()

    const query = await GET_DB().collection(categoryProductModel.CATEGORY_PRODUCT_COLLECTION_NAME).aggregate([
      { $match: { category_id: new ObjectId(categoryId) } },
        {
          $lookup: {
            from: PRODUCT_COLLECTION_NAME,
            localField: 'product_id',
            foreignField: '_id',
            pipeline: [
            { $match: { deleted: false } },
          ],
            as: 'product'
          }
        },
        // $unwind = “bóc từng phần tử trong array ra thành document riêng”
        { $unwind: '$product' },

      {
        $facet: {
          priceStats: [
            {
              $group: {
                _id: null,
                minPrice: { $min: '$product.price' },
                maxPrice: { $max: '$product.price' }
              }
            }
          ],
          queryData: [
            ...filterStages.map(stage => {
              if (stage.$match) {
                const newMatch = {}
                Object.keys(stage.$match).forEach(key => {
                  newMatch[`product.${key}`] = stage.$match[key]
                })
                return { $match: newMatch }
              }
              return stage
            }),
            sortStage,
            { $skip: (sanitizedPage - 1) * sanitizedLimit },
            { $limit: sanitizedLimit },
            {
              //  ko có $project thì data sẽ là các field của category_product + product nested 
              $project: {
                _id: '$product._id',
                // categoryId: '$category_id',
                title: '$product.title',
                slug: '$product.slug',
                thumbnail: '$product.thumbnail',
                price: '$product.price',
                originalPrice: '$product.originalPrice',
                discountPercentage: '$product.discountPercentage',
                featured: '$product.featured',
                isBestPrice: '$product.isBestPrice',
                isOnlineExclusive: '$product.isOnlineExclusive',
                tags: '$product.tags',
                brand: '$product.brand',
                stock: '$product.stock',
                // sold: '$_productSold',
                // isNew: '$_productIsNew',
                createdAt: '$product.createdAt'
              }
            }
          ],
          queryTotal: [
            ...filterStages.map(stage => {
              if (stage.$match) {
                const newMatch = {}
                Object.keys(stage.$match).forEach(key => {
                  newMatch[`product.${key}`] = stage.$match[key]
                })
                return { $match: newMatch }
              }
              return stage
            }),
            { $count: 'count' }
          ]
        }
      }
    ]).toArray()

    const res = query[0] || {}
    const data = Array.isArray(res.queryData) ? res.queryData : []
    const total = res.queryTotal?.[0]?.count || 0
    const stats = res.priceStats?.[0] || null

    return {
      data,
      total,
      priceStats: {
        minPrice: stats?.minPrice ?? 0,
        maxPrice: stats?.maxPrice ?? 0
      }
    }
  } catch (error) {
    throw new Error(error)
  }
}

/**
 * Lấy category chi tiết kèm danh sách products của nó (qua slug)
 * Phục vụ trang danh sách sản phẩm theo category
 */
// const getByCategorySlug = async (slug, limit = 20) => {
//   try {
//     const result = await GET_DB().collection('categories').aggregate([
//       // 1. Tìm category theo slug
//       { $match: { slug: slug, deleted: false, status: 'active' } },

//       // 2. Lookup sang category_products để lấy danh sách product_id
//       {
//         $lookup: {
//           from: categoryProductModel.CATEGORY_PRODUCT_COLLECTION_NAME,
//           let: { catId: '$_id' },
//           pipeline: [
//             {
//               $match: {
//                 $expr: {
//                   $eq: [
//                     {
//                       $cond: [
//                         { $eq: [{ $type: '$category_id' }, 'objectId'] },
//                         '$category_id',
//                         { $toObjectId: '$category_id' }
//                       ]
//                     },
//                     '$$catId'
//                   ]
//                 },
//                 deleted: { $ne: true }
//               }
//             },
//             { $sort: { position: 1 } }
//           ],
//           as: 'product_links'
//         }
//       },

//       // 3. Lookup sang products để lấy thông tin đầy đủ
//       {
//         $lookup: {
//           from: PRODUCT_COLLECTION_NAME,
//           let: { productIds: '$product_links.product_id' },
//           pipeline: [
//             {
//               $match: {
//                 $expr: {
//                   $in: [
//                     {
//                       $cond: [
//                         { $eq: [{ $type: '$_id' }, 'objectId'] },
//                         { $toString: '$_id' },
//                         '$_id'
//                       ]
//                     },
//                     '$$productIds'
//                   ]
//                 },
//                 deleted: false,
//                 status: PRODUCT_STATUSES.ACTIVE
//               }
//             },
//             { $limit: limit }
//           ],
//           as: 'products'
//         }
//       },

//       // 4. Project chỉ lấy field cần thiết
//       {
//         $project: {
//           title: 1,
//           slug: 1,
//           description: 1,
//           bannerImage: 1,
//           badgeText: 1,
//           thumbnail: 1,
//           products: {
//             _id: 1,
//             title: 1,
//             slug: 1,
//             thumbnail: 1,
//             price: 1,
//             originalPrice: 1,
//             discountPercentage: 1,
//             stock: 1,
//             unit: 1,
//             featured: 1,
//             ratings: 1
//           }
//         }
//       }
//     ]).toArray()

//     return result[0] || null
//   } catch (error) {
//     throw new Error(error)
//   }
// }

export const productModel = {
  PRODUCT_STATUSES,
  PRODUCT_UNITS,
  PRODUCT_COLLECTION_NAME,
  createNew,
  findOneById,
  findOneBySlug,
  findOneBySlugAny,
  findManyByIds,
  getDetails,
  getList,
  update,
  pushUpdatedBy,
  softDelete,
  getCampaignProducts,
  decreaseStockIfAvailable,
  increaseStock,
  getPaginatedCampaignProducts,
  getProductsByCategory,
  getListByPrimaryCategory,
  // getByCategorySlug,
  syncRatingsFromReviews
}
