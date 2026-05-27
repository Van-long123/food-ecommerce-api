import express from 'express'
import { orderController } from '~/controllers/orderController'
import { authMiddleware } from '~/middlewares/authMiddleware'
import { PERMISSIONS } from '~/constants/permissions'

const Router = express.Router()

// Payments
Router.get(
	'/stats',
	authMiddleware.requirePermission(PERMISSIONS.PAYMENTS.VIEW),
	orderController.getPaymentStats
)
Router.get(
	'/',
	authMiddleware.requirePermission(PERMISSIONS.PAYMENTS.VIEW),
	orderController.getPayments
)
Router.put(
	'/:id/confirm-cod',
	authMiddleware.requirePermission(PERMISSIONS.PAYMENTS.EDIT),
	orderController.confirmCodPayment
)

export const adminPaymentRoute = Router
