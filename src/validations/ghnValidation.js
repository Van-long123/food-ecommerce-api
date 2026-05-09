import { StatusCodes } from 'http-status-codes'
import ApiError from '~/utils/ApiError'
import { env } from '~/config/environment'

const checkGHNToken = (req, res, next) => {
  if (!env.GHN_TOKEN) {
    return next(new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu cấu hình token GHN'))
  }
  next()
}

export const ghnValidation = {
  checkGHNToken
}
