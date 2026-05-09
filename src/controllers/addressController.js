import { StatusCodes } from 'http-status-codes'
import { addressService } from '~/services/addressService'

const getAddresses = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const data = await addressService.getAddresses(userId)
    res.status(StatusCodes.OK).json({ success: true, data })
  } catch (error) {
    next(error)
  }
}

const createAddress = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const data = await addressService.createAddress(userId, req.body)
    res.status(StatusCodes.CREATED).json({ success: true, data })
  } catch (error) {
    next(error)
  }
}

const updateAddress = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const addressId = req.params.id
    const data = await addressService.updateAddress(userId, addressId, req.body)
    res.status(StatusCodes.OK).json({ success: true, data })
  } catch (error) {
    next(error)
  }
}

const deleteAddress = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const addressId = req.params.id
    const data = await addressService.deleteAddress(userId, addressId)
    res.status(StatusCodes.OK).json({ success: true, data })
  } catch (error) {
    next(error)
  }
}

export const addressController = {
  getAddresses,
  createAddress,
  updateAddress,
  deleteAddress
}
