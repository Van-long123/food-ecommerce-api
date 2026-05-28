import express from 'express'
import { orderController } from '~/controllers/orderController'
import { authMiddleware } from '~/middlewares/authMiddleware'

const router = express.Router()

router.route('/validate-stock')
  .post(authMiddleware.isAuthorized, orderController.validateStock)

router.route('/my-orders')
  .get(authMiddleware.isAuthorized, orderController.getMyOrders)

router.route('/')
  .post(authMiddleware.isAuthorized, orderController.createNew)
router.route('/:id')
  .get(authMiddleware.isAuthorized, orderController.getOrderDetails)
router.route('/:id/cancel')
  .put(authMiddleware.isAuthorized, orderController.cancelOrder)
router.route('/:id/repay')
  .post(authMiddleware.isAuthorized, orderController.repayOrder)
router.route('/:id/switch-to-cod')
  .patch(authMiddleware.isAuthorized, orderController.switchToCod)
router.route('/:id/received')
  .put(authMiddleware.isAuthorized, orderController.confirmReceived)

export const clientOrderRoute = router
