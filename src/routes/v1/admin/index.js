import express from 'express'
import { adminCategoryRoute } from './categoryRoute'
import { adminProductRoute } from './productRoute'
import { adminArticleRoute } from './articleRoute'

const router = express.Router()

router.use('/categories', adminCategoryRoute)
router.use('/products', adminProductRoute)
router.use('/articles', adminArticleRoute)

export const adminRouter = router
