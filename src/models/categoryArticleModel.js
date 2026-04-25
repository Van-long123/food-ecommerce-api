import Joi from 'joi'

const CATEGORY_ARTICLE_COLLECTION_NAME = 'category_articles'

const CATEGORY_ARTICLE_COLLECTION_SCHEMA = Joi.object({
  category_id: Joi.string().required(),
  article_id: Joi.string().required(),
})



export const categoryArticleModel = {
  CATEGORY_ARTICLE_COLLECTION_NAME,
}
