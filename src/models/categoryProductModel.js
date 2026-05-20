import Joi from 'joi'
import { ObjectId } from 'mongodb'
import { GET_DB } from '~/config/mongodb'

const CATEGORY_PRODUCT_COLLECTION_NAME = 'category_products'

const CATEGORY_PRODUCT_COLLECTION_SCHEMA = Joi.object({
  category_id: Joi.string().required(),
  product_id: Joi.string().required(),
  // position: Joi.number().integer().min(0).default(0),
  // isPrimary: Joi.boolean().default(false),
  createdAt: Joi.date().default(() => new Date()),
  updatedAt: Joi.date().default(null)
})

export const categoryProductModel = {
  CATEGORY_PRODUCT_COLLECTION_NAME,
}
