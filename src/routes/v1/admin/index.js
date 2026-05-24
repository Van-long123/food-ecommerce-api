import express from 'express'
import { authMiddleware } from '~/middlewares/authMiddleware'
import { adminCategoryRoute } from './categoryRoute'
import { adminProductRoute } from './productRoute'
import { adminArticleRoute } from './articleRoute'
import { adminRefundRequestRoute } from './refundRequestRoute'
import { adminSettingsRoute } from './settingsRoute'
import { adminRoleRoute } from './roleRoute'
import { adminUserRoute } from './userRoute'

const router = express.Router()

router.use(authMiddleware.isAuthorized, authMiddleware.isAdmin)

router.use('/categories', adminCategoryRoute)
router.use('/products', adminProductRoute)
router.use('/articles', adminArticleRoute)
router.use('/refund-requests', adminRefundRequestRoute)
router.use('/settings', adminSettingsRoute)
router.use('/roles', adminRoleRoute)
router.use('/users', adminUserRoute)

export const adminRouter = router
