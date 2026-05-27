import express from 'express'
import { authMiddleware } from '~/middlewares/authMiddleware'
import { voucherController } from '~/controllers/voucherController'
import { voucherValidation } from '~/validations/voucherValidation'
import { PERMISSIONS } from '~/constants/permissions'

const Router = express.Router()

Router.use(authMiddleware.isAuthorized, authMiddleware.isAdmin)

Router.route('/')
  .get(authMiddleware.requirePermission(PERMISSIONS.VOUCHERS.VIEW), voucherController.getListAdmin)
  .post(
    authMiddleware.requirePermission(PERMISSIONS.VOUCHERS.CREATE),
    voucherValidation.createNew,
    voucherController.createNew
  )

Router.route('/bulk-status')
  .put(
    authMiddleware.requirePermission(PERMISSIONS.VOUCHERS.EDIT),
    voucherValidation.adminBulkStatus,
    voucherController.bulkUpdateStatusAdmin
  )

Router.route('/bulk')
  .delete(
    authMiddleware.requirePermission(PERMISSIONS.VOUCHERS.DELETE),
    voucherValidation.adminBulkDelete,
    voucherController.bulkDeleteAdmin
  )

Router.route('/:id')
  .get(authMiddleware.requirePermission(PERMISSIONS.VOUCHERS.VIEW), voucherController.getDetailAdmin)
  .put(
    authMiddleware.requirePermission(PERMISSIONS.VOUCHERS.EDIT),
    voucherValidation.update,
    voucherController.updateVoucher
  )
  .delete(authMiddleware.requirePermission(PERMISSIONS.VOUCHERS.DELETE), voucherController.deleteVoucher)

export const adminVoucherRoute = Router