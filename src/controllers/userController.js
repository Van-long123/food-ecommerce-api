import { StatusCodes } from 'http-status-codes'
import ms from 'ms'
import { userService } from '~/services/userService'
import { WEBSITE_DOMAIN } from '~/utils/constants'

const createNew = async (req, res, next) => {
  try {
    const createdUser = await userService.createNew(req.body)
    res.status(StatusCodes.CREATED).json(createdUser)
  } catch (error) {
    next(error)
  }
}

const login = async (req, res, next) => {
  try {
    const result = await userService.login(req.body)

    res.cookie('accessToken', result.accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: ms('14 days')
    })

    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: ms('14 days')
    })

    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

const verifyAccount = async (req, res, next) => {
  try {
    const result = await userService.verifyAccount(req.body)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

const logout = async (req, res, next) => {
  try {
    res.clearCookie('accessToken')
    res.clearCookie('refreshToken')
    res.status(StatusCodes.OK).json({ loggedOut: true })
  } catch (error) {
    next(error)
  }
}

const refreshToken = async (req, res, next) => {
  try {
    const result = await userService.refreshToken(req.cookies?.refreshToken)
    res.cookie('accessToken', result.accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: ms('14 days')
    })
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(new Error('Vui lòng đăng nhập lại!'))
  }
}

const update = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const updatedUser = await userService.update(userId, req.body, req.file)
    return res.status(StatusCodes.OK).json(updatedUser)
  } catch (error) {
    next(error)
  }
}

const forgotPassword = async (req, res, next) => {
  try {
    const result = await userService.forgotPassword(req.body)
    return res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

const resetPassword = async (req, res, next) => {
  try {
    const result = await userService.resetPassword(req.body)
    return res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

// Social Auth Callback — được gọi sau khi Passport xác thực xong
// req.user chứa socialProfile: { socialId, provider, email, displayName, avatar }
const socialAuthCallback = async (req, res, next) => {
  try {
    if (!req.user) {
      res.redirect(`${WEBSITE_DOMAIN}/auth/login?oauth_error=1`)
      return
    }

    const result = await userService.socialAuthCallback(req.user)

    // Đặt HttpOnly Cookie — cùng config với local login
    res.cookie('accessToken', result.accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: ms('14 days')
    })

    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: ms('14 days')
    })

    // Redirect về FE với userId để trang login-success gọi verifyOAuth
    res.redirect(`${WEBSITE_DOMAIN}/auth/login-success?userId=${result._id}`)
  } catch (error) {
    next(error)
  }
}

// Verify OAuth — FE POST lên đây để lấy thông tin user sau OAuth
const verifyOAuth = async (req, res, next) => {
  try {
    const result = await userService.verifyOAuth(req.body)
    return res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

export const userController = {
  createNew,
  verifyAccount,
  login,
  logout,
  refreshToken,
  update,
  forgotPassword,
  resetPassword,
  socialAuthCallback,
  verifyOAuth
}
