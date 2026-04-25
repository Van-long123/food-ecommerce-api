import Joi from 'joi'

const CATEGORY_PRODUCT_COLLECTION_NAME = 'category_products'

const CATEGORY_PRODUCT_COLLECTION_SCHEMA = Joi.object({
  category_id: Joi.string().required(),
  product_id: Joi.string().required(),
})

export const categoryProductModel = {
  CATEGORY_PRODUCT_COLLECTION_NAME,
}
