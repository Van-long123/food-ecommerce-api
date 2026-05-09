import Joi from 'joi'

const CATEGORY_PRODUCT_COLLECTION_NAME = 'category_products'

const CATEGORY_PRODUCT_COLLECTION_SCHEMA = Joi.object({
  category_id: Joi.string().required(),
  product_id: Joi.string().required(),
  createdAt: Joi.date().default(Date.now),
    updatedAt: Joi.date().default(null)
})

export const categoryProductModel = {
  CATEGORY_PRODUCT_COLLECTION_NAME,
}
