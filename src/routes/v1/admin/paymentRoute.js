import express from 'express'
import { orderController } from '~/controllers/orderController'

const Router = express.Router()

// ── Payments ──────────────────────────────────────────────────
Router.get('/stats', orderController.getPaymentStats)
Router.get('/', orderController.getPayments)
Router.put('/:id/confirm-cod', orderController.confirmCodPayment)

export const adminPaymentRoute = Router
