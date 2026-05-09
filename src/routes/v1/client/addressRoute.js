import express from 'express'
import { addressController } from '~/controllers/addressController'
import { addressValidation } from '~/validations/addressValidation'
import { authMiddleware } from '~/middlewares/authMiddleware'

const router = express.Router()

router.use(authMiddleware.isAuthorized)

router.route('/')
  .get(addressController.getAddresses)
  .post(addressValidation.createNew, addressController.createAddress)

router.route('/:id')
  .put(addressValidation.update, addressController.updateAddress)
  .delete(addressController.deleteAddress)

export const clientAddressRoute = router
