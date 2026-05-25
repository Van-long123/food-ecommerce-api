import express from 'express'
import { authMiddleware } from '~/middlewares/authMiddleware'
import { voucherController } from '~/controllers/voucherController'
import { voucherValidation } from '~/validations/voucherValidation'

const Router = express.Router()

Router.use(authMiddleware.isAuthorized, authMiddleware.isAdmin)

Router.route('/')
  .get(voucherController.getListAdmin)
  .post(voucherValidation.createNew, voucherController.createNew)

Router.route('/bulk-status')
  .put(voucherValidation.adminBulkStatus, voucherController.bulkUpdateStatusAdmin)

Router.route('/bulk')
  .delete(voucherValidation.adminBulkDelete, voucherController.bulkDeleteAdmin)

Router.route('/:id')
  .get(voucherController.getDetailAdmin)
  .put(voucherValidation.update, voucherController.updateVoucher)
  .delete(voucherController.deleteVoucher)

export const adminVoucherRoute = Router