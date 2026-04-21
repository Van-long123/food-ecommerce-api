import { StatusCodes } from 'http-status-codes'
import { env } from '~/config/environment'
import { jwtProvider } from '~/providers/jwtProvider'
import ApiError from '~/utils/ApiError'

const isAuthorized = async (req, res, next) => {
  const clientAccessToken = req.cookies?.accessToken

  if (!clientAccessToken) {
    next(new ApiError(StatusCodes.UNAUTHORIZED, 'Không tìm thấy access token!'))
    return
  }

  try {
    const accessTokenDecoded = await jwtProvider.verifyToken(clientAccessToken, env.ACCESS_TOKEN_PRIVATE_KEY)
    req.jwtDecoded = accessTokenDecoded
    next()
  } catch (error) {
    if (error?.message?.includes('jwt expired')) {
      next(new ApiError(StatusCodes.GONE, 'Access token đã hết hạn, cần làm mới token.'))
      return
    }

    next(new ApiError(StatusCodes.UNAUTHORIZED, 'Bạn không có quyền truy cập!'))
  }
}

export const authMiddleware = { isAuthorized }
