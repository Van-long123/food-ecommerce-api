import { StatusCodes } from 'http-status-codes'
import { checkoutService } from '~/services/checkoutService'

const getShippingFee = async (req, res, next) => {
  try {
    const userId             = req.jwtDecoded._id
    const { addressId, products } = req.body

    const result = await checkoutService.getShippingFee(userId, addressId, products)

    res.status(StatusCodes.OK).json({
      success: true,
      data: result
    })
  } catch (error) {
    next(error)
  }
}

const createCodCheckout = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const result = await checkoutService.createCodCheckout(userId, req.body)

    res.status(StatusCodes.CREATED).json({
      success: true,
      data: result
    })
  } catch (error) {
    next(error)
  }
}

export const checkoutController = {
  getShippingFee,
  createCodCheckout
}
