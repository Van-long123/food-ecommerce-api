import express from 'express'
import { authMiddleware } from '~/middlewares/authMiddleware'
import { checkoutValidation } from '~/validations/checkoutValidation'
import { checkoutController } from '~/controllers/checkoutController'

const router = express.Router()

// POST /v1/client/checkout/shipping-fee
router.post(
  '/shipping-fee',
  authMiddleware.isAuthorized,
  checkoutValidation.getShippingFee,
  checkoutController.getShippingFee
)

export const clientCheckoutRoute = router
