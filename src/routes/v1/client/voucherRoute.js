import express from 'express'
import { voucherController } from '~/controllers/voucherController'
import { authMiddleware } from '~/middlewares/authMiddleware'

const Router = express.Router()

// GET /v1/client/vouchers  → Danh sách vouchers active (public)
Router.route('/').get(voucherController.getListClient)

// POST /v1/client/vouchers/validate → Validate & Apply voucher (public & auth)
Router.route('/validate').post(authMiddleware.isAuthorizedOptional, voucherController.validateVoucher)


export const clientVoucherRoute = Router
