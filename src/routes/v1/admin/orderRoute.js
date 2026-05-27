import express from 'express'
import { orderController } from '~/controllers/orderController'
import { orderValidation } from '~/validations/orderValidation'
import { authMiddleware } from '~/middlewares/authMiddleware'
import { PERMISSIONS } from '~/constants/permissions'

const Router = express.Router()

// Orders
Router.get('/', authMiddleware.requirePermission(PERMISSIONS.ORDERS.VIEW), orderController.getOrders)
Router.put(
	'/bulk-status',
	authMiddleware.requirePermission(PERMISSIONS.ORDERS.EDIT),
	orderValidation.adminBulkStatus,
	orderController.bulkUpdateOrderStatus
)
Router.get('/:id', authMiddleware.requirePermission(PERMISSIONS.ORDERS.VIEW), orderController.getOrderDetailAdmin)
Router.put(
	'/:id/status',
	authMiddleware.requirePermission(PERMISSIONS.ORDERS.EDIT),
	orderController.updateOrderStatus
)

export const adminOrderRoute = Router
