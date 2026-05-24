import { StatusCodes } from 'http-status-codes'
import { env } from '~/config/environment'
import { jwtProvider } from '~/providers/jwtProvider'
import ApiError from '~/utils/ApiError'
import { userModel } from '~/models/userModel'

const isAuthorized = async (req, res, next) => {
  const clientAccessToken = req.cookies?.accessToken

  if (!clientAccessToken) {
    next(new ApiError(StatusCodes.UNAUTHORIZED, 'Không tìm thấy access token!'))
    return
  }

  try {
    const accessTokenDecoded = await jwtProvider.verifyToken(clientAccessToken, env.ACCESS_TOKEN_PRIVATE_KEY)
    req.jwtDecoded = accessTokenDecoded
    req.user = {
      userId: accessTokenDecoded._id,
      email: accessTokenDecoded.email
    }
    next()
  } catch (error) {
    if (error?.message?.includes('jwt expired')) {
      next(new ApiError(StatusCodes.GONE, 'Access token đã hết hạn, cần làm mới token.'))
      return
    }

    next(new ApiError(StatusCodes.UNAUTHORIZED, 'Bạn không có quyền truy cập!'))
  }
}

const isAuthorizedOptional = async (req, res, next) => {
  const clientAccessToken = req.cookies?.accessToken
  if (!clientAccessToken) {
    return next()
  }

  try {
    const accessTokenDecoded = await jwtProvider.verifyToken(clientAccessToken, env.ACCESS_TOKEN_PRIVATE_KEY)
    req.jwtDecoded = accessTokenDecoded
    req.user = {
      userId: accessTokenDecoded._id,
      email: accessTokenDecoded.email
    }
    next()
  } catch (error) {
    next() // Ignore auth error if optional
  }
}

/**
 * Kiểm tra quyền Admin — phải dùng sau isAuthorized
 * Lấy role từ DB để tránh role bị giả mạo trong token.
 */
const isAdmin = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded?._id
    if (!userId) {
      return next(new ApiError(StatusCodes.UNAUTHORIZED, 'Không tìm thấy thông tin xác thực!'))
    }

    const user = await userModel.findOneById(userId)
    if (!user) {
      return next(new ApiError(StatusCodes.UNAUTHORIZED, 'Tài khoản không tồn tại!'))
    }

    if (user.role !== userModel.USER_ROLES.ADMIN) {
      return next(new ApiError(StatusCodes.FORBIDDEN, 'Bạn không có quyền thực hiện thao tác này!'))
    }

    next()
  } catch (error) {
    next(new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'Lỗi xác thực quyền truy cập!'))
  }
}

export const authMiddleware = { isAuthorized, isAuthorizedOptional, isAdmin }
