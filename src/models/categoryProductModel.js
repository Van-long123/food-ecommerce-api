import Joi from 'joi'
import { ObjectId } from 'mongodb'
import { GET_DB } from '~/config/mongodb'

const CATEGORY_PRODUCT_COLLECTION_NAME = 'category_products'

const CATEGORY_PRODUCT_COLLECTION_SCHEMA = Joi.object({
  category_id: Joi.any().required(),
  product_id: Joi.any().required(),
  createdAt: Joi.date().default(() => new Date()),
  updatedAt: Joi.date().default(null)
})

const validateBeforeCreate = async (data) => {
  return await CATEGORY_PRODUCT_COLLECTION_SCHEMA.validateAsync(data, { abortEarly: false })
}

/**
 * Upsert: nếu đã tồn tại (product_id + category_id) thì update, chưa có thì insert */
const upsert = async ({ product_id, category_id }) => {
  try {
    const filter = {
      product_id: new ObjectId(product_id),
      category_id: new ObjectId(category_id)
    }
    const update = {
      $set: { updatedAt: new Date() },
      $setOnInsert: {
        product_id: new ObjectId(product_id),
        category_id: new ObjectId(category_id),
        createdAt: new Date()
      }
    }
    const result = await GET_DB()
      .collection(CATEGORY_PRODUCT_COLLECTION_NAME)
      .findOneAndUpdate(filter, update, { upsert: true, returnDocument: 'after' })
    return result
  } catch (error) {
    throw new Error(error)
  }
}

/**
 * Xóa một mapping cụ thể */
const removeOne = async ({ product_id, category_id }) => {
  try {
    return await GET_DB()
      .collection(CATEGORY_PRODUCT_COLLECTION_NAME)
      .deleteOne({
        product_id: new ObjectId(product_id),
        category_id: new ObjectId(category_id)
      })
  } catch (error) {
    throw new Error(error)
  }
}

/**
 * Xóa tất cả categories của một product (dùng khi soft-delete product) */
const deleteAllByProductId = async (product_id) => {
  try {
    return await GET_DB()
      .collection(CATEGORY_PRODUCT_COLLECTION_NAME)
      .deleteMany({ product_id: new ObjectId(product_id) })
  } catch (error) {
    throw new Error(error)
  }
}

/**
 * Lấy tất cả category_ids của một product */
const findAllByProductId = async (product_id) => {
  try {
    return await GET_DB()
      .collection(CATEGORY_PRODUCT_COLLECTION_NAME)
      .find({ product_id: new ObjectId(product_id) })
      .toArray()
  } catch (error) {
    throw new Error(error)
  }
}

/**
 * Đồng bộ lại danh sách categories cho product:
 * - Xóa hết mappings cũ không còn trong categoryIds mới
 * - Upsert các mapping mới/cập nhật */
const syncByProductId = async (product_id, categoryIds = []) => {
  try {
    const pId = new ObjectId(product_id)
    const newCatIds = categoryIds.map(id => new ObjectId(id))

    // Xóa các mapping không còn trong danh sách mới
    if (newCatIds.length > 0) {
      await GET_DB()
        .collection(CATEGORY_PRODUCT_COLLECTION_NAME)
        .deleteMany({ product_id: pId, category_id: { $nin: newCatIds } })
    } else {
      // Nếu list mới rỗng, xóa hết
      await deleteAllByProductId(product_id)
    }
  } catch (error) {
    throw new Error(error)
  }
}

export const categoryProductModel = {
  CATEGORY_PRODUCT_COLLECTION_NAME,
  upsert,
  removeOne,
  deleteAllByProductId,
  findAllByProductId,
  syncByProductId
}
