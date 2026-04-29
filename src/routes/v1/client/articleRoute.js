import express from 'express'
import { articleController } from '~/controllers/articleController'
import { authMiddleware } from '~/middlewares/authMiddleware'
import { articleValidation } from '~/validations/articleValidation'

const Router = express.Router()

// GET /v1/client/articles        → Danh sách articles (active, public)
// GET /v1/client/articles/:slug  → Chi tiết article + tăng views
Router.route('/')
  .get(articleController.getListClient)

Router.route('/:slug')
  .get(articleController.getDetailClient)

Router.route('/:slug/comments')
  .post(authMiddleware.isAuthorized, articleValidation.createComment, articleController.createCommentClient)

export const clientArticleRoute = Router
