import express from 'express'
import { adminCategoryRoute } from './categoryRoute'
import { adminProductRoute } from './productRoute'
import { adminArticleRoute } from './articleRoute'
import { adminRefundRequestRoute } from './refundRequestRoute'

const router = express.Router()

router.use('/categories', adminCategoryRoute)
router.use('/products', adminProductRoute)
router.use('/articles', adminArticleRoute)
router.use('/refund-requests', adminRefundRequestRoute)

export const adminRouter = router
