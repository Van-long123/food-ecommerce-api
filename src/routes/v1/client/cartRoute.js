import express from 'express'
import { cartController } from '~/controllers/cartController'
import { authMiddleware } from '~/middlewares/authMiddleware'
import { cartValidation } from '~/validations/cartValidation'

const Router = express.Router()

Router.route('/validate')
  .post(cartValidation.validateGuestCart, cartController.validateGuestCart)

Router.use(authMiddleware.isAuthorized)

Router.route('/')
  .get(cartController.getCart)

Router.route('/merge')
  .post(cartValidation.mergeGuestCart, cartController.mergeGuestCart)

Router.route('/items')
  .post(cartValidation.addItem, cartController.addItem)
  .delete(cartValidation.removeItems, cartController.removeItems)

Router.route('/items/:productId')
  .patch(cartValidation.updateItem, cartController.updateItem)
  .delete(cartController.removeItem)

export const cartRoute = Router
