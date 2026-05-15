import express from 'express'
import { orderController } from '~/controllers/orderController'
import { authMiddleware } from '~/middlewares/authMiddleware'

const router = express.Router()

router.route('/validate-stock')
  .post(authMiddleware.isAuthorized, orderController.validateStock)

router.route('/')
  .post(authMiddleware.isAuthorized, orderController.createNew)

export const clientOrderRoute = router
