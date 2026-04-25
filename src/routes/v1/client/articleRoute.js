import express from 'express'
import { articleController } from '~/controllers/articleController'

const Router = express.Router()

// GET /v1/client/articles        → Danh sách articles (active, public)
// GET /v1/client/articles/:slug  → Chi tiết article + tăng views
Router.route('/')
  .get(articleController.getListClient)

Router.route('/:slug')
  .get(articleController.getDetailClient)

export const clientArticleRoute = Router
