import express from 'express'
import { orderController } from '~/controllers/orderController'
import { authMiddleware } from '~/middlewares/authMiddleware'

const router = express.Router()

router.route('/')
  .post(authMiddleware.isAuthorized, orderController.createNew)

export const clientOrderRoute = router
