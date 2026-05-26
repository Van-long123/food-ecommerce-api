import express from 'express'
import { orderController } from '~/controllers/orderController'
import { orderValidation } from '~/validations/orderValidation'

const Router = express.Router()

// ── Orders ────────────────────────────────────────────────────
Router.get('/', orderController.getOrders)
Router.put('/bulk-status', orderValidation.adminBulkStatus, orderController.bulkUpdateOrderStatus)
Router.get('/:id', orderController.getOrderDetailAdmin)
Router.put('/:id/status', orderController.updateOrderStatus)

export const adminOrderRoute = Router
