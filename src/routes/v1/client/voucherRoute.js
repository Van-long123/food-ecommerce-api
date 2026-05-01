import express from 'express'
import { voucherController } from '~/controllers/voucherController'

const Router = express.Router()

// GET /v1/client/vouchers  → Danh sách vouchers active (public)
Router.route('/').get(voucherController.getListClient)

export const clientVoucherRoute = Router
