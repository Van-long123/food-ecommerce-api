import express from 'express'
import { authMiddleware } from '~/middlewares/authMiddleware'
import { adminCategoryRoute } from './categoryRoute'
import { adminProductRoute } from './productRoute'
import { adminArticleRoute } from './articleRoute'
import { adminRefundRequestRoute } from './refundRequestRoute'
import { adminSettingsRoute } from './settingsRoute'
import { adminRoleRoute } from './roleRoute'
import { adminUserRoute } from './userRoute'
import { adminProfileRoute } from './profileRoute'
import { adminReviewRoute } from './reviewRoute'
import { adminVoucherRoute } from './voucherRoute'
import { adminOrderRoute } from './orderRoute'
import { adminPaymentRoute } from './paymentRoute'


const router = express.Router()

router.use(authMiddleware.isAuthorized, authMiddleware.isAdmin)

router.use('/categories', adminCategoryRoute)
router.use('/products', adminProductRoute)
router.use('/articles', adminArticleRoute)
router.use('/refund-requests', adminRefundRequestRoute)
router.use('/settings', adminSettingsRoute)
router.use('/roles', adminRoleRoute)
router.use('/users', adminUserRoute)
router.use('/profile', adminProfileRoute)
router.use('/reviews', adminReviewRoute)
router.use('/vouchers', adminVoucherRoute)
router.use('/orders', adminOrderRoute)
router.use('/payments', adminPaymentRoute)

export const adminRouter = router
