import { StatusCodes } from 'http-status-codes'
import { ghnService } from '~/services/ghnService'

const getProvinces = async (req, res, next) => {
  try {
    const data = await ghnService.getProvinces()
    res.status(StatusCodes.OK).json({
      success: true,
      data
    })
  } catch (error) {
    next(error)
  }
}

const getDistricts = async (req, res, next) => {
  try {
    const { provinceId } = req.query
    const data = await ghnService.getDistricts(provinceId)
    res.status(StatusCodes.OK).json({
      success: true,
      data
    })
  } catch (error) {
    next(error)
  }
}

const getWards = async (req, res, next) => {
  try {
    const { districtId } = req.query
    const data = await ghnService.getWards(districtId)
    res.status(StatusCodes.OK).json({
      success: true,
      data
    })
  } catch (error) {
    next(error)
  }
}

export const ghnController = {
  getProvinces,
  getDistricts,
  getWards
}
