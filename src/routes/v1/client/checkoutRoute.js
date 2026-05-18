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

// POST /v1/client/checkout/cod
router.post(
  '/cod',
  authMiddleware.isAuthorized,
  checkoutValidation.createCodCheckout,
  checkoutController.createCodCheckout
)

// POST /v1/client/checkout/payos
router.post(
  '/payos',
  authMiddleware.isAuthorized,
  checkoutValidation.createCodCheckout, // Dùng chung schema với COD
  checkoutController.createPayOSCheckout
)

// POST /v1/client/checkout/payos-webhook (Public - No Auth Middleware)
router.post(
  '/payos-webhook',
  checkoutController.handlePayOSWebhook
)

export const clientCheckoutRoute = router
