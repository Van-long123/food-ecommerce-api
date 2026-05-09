import express from 'express'
import { clientCategoryRoute } from './categoryRoute'
import { clientProductRoute } from './productRoute'
import { clientArticleRoute } from './articleRoute'
import { homeRoute } from './homeRoute'
import { userRoute } from './userRoute'
import { clientVoucherRoute } from './voucherRoute'
import { cartRoute } from './cartRoute'
import { clientGhnRoute } from './ghnRoute'
import { clientAddressRoute } from './addressRoute'

const router = express.Router()

router.use('/users', userRoute)

router.use('/categories', clientCategoryRoute)
router.use('/products', clientProductRoute)
router.use('/articles', clientArticleRoute)
router.use('/home', homeRoute)
router.use('/vouchers', clientVoucherRoute)
router.use('/cart', cartRoute)
router.use('/ghn', clientGhnRoute)
router.use('/addresses', clientAddressRoute)

export const clientRouter = router
