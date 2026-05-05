import { StatusCodes } from 'http-status-codes'
import { cartService } from '~/services/cartService'

const getCart = async (req, res, next) => {
  try {
    const result = await cartService.getCart(req.jwtDecoded._id)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

const addItem = async (req, res, next) => {
  try {
    const result = await cartService.addItem(req.jwtDecoded._id, req.body)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

const updateItem = async (req, res, next) => {
  try {
    const result = await cartService.updateItemQuantity(
      req.jwtDecoded._id,
      req.params.productId,
      req.body.quantity
    )
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

const removeItem = async (req, res, next) => {
  try {
    const result = await cartService.removeItem(req.jwtDecoded._id, req.params.productId)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

const removeItems = async (req, res, next) => {
  try {
    const result = await cartService.removeItems(req.jwtDecoded._id, req.body.productIds)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

const mergeGuestCart = async (req, res, next) => {
  try {
    console.log("🚀 ~ mergeGuestCart ~ req.body.items:", req.body.items)
    const result = await cartService.mergeGuestCart(req.jwtDecoded._id, req.body.items)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

const validateGuestCart = async (req, res, next) => {
  try {
    const result = await cartService.validateGuestCart(req.body.items)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

export const cartController = {
  getCart,
  addItem,
  updateItem,
  removeItem,
  removeItems,
  mergeGuestCart,
  validateGuestCart
}
