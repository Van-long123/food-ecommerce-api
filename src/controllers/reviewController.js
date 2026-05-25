import { StatusCodes } from 'http-status-codes'
import { reviewService } from '~/services/reviewService'

const getListAdmin = async (req, res, next) => {
  try {
    const result = await reviewService.getListAdmin(req.query)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

const getDetailAdmin = async (req, res, next) => {
  try {
    const result = await reviewService.getDetailAdmin(req.params.id)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

const updateStatusAdmin = async (req, res, next) => {
  try {
    const result = await reviewService.updateStatusAdmin(req.params.id, req.body?.status)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

export const reviewController = {
  getListAdmin,
  getDetailAdmin,
  updateStatusAdmin
}
