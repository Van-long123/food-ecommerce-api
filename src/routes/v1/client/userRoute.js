import express from 'express'
import { userValidation } from '~/validations/userValidation'
import { userController } from '~/controllers/userController'
import { authMiddleware } from '~/middlewares/authMiddleware'
import { multerUploadMiddleware } from '~/middlewares/multerUploadMiddleware'
import passport from '~/config/passport'
import { WEBSITE_DOMAIN } from '~/utils/constants'

const Router = express.Router()

Router.route('/register')
  .post(userValidation.createNew, userController.createNew)

Router.route('/verify')
  .put(userValidation.verifyAccount, userController.verifyAccount)

Router.route('/login')
  .post(userValidation.login, userController.login)

Router.route('/logout')
  .delete(userController.logout)

Router.route('/refresh_token')
  .get(userController.refreshToken)

Router.route('/forgot-password')
  .post(userValidation.forgotPassword, userController.forgotPassword)

Router.route('/reset-password')
  .put(userValidation.resetPassword, userController.resetPassword)

Router.route('/set-password')
  .post(userValidation.setPassword, userController.setPassword)

Router.route('/update')
  .put(authMiddleware.isAuthorized, multerUploadMiddleware.upload.single('avatar'), userValidation.update, userController.update)

Router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }))

Router.get('/google/callback', (req, res, next) => {
  passport.authenticate('google', { session: false }, (err, profile) => {
    if (err || !profile) {
      return res.redirect(`${WEBSITE_DOMAIN}/auth/login?oauth_error=1`)
    }
    req.user = profile
    next()
  })(req, res, next)
}, userController.socialAuthCallback)

Router.get('/facebook', passport.authenticate('facebook', { scope: ['email'] }))

Router.get('/facebook/callback', (req, res, next) => {
  passport.authenticate('facebook', { session: false }, (err, profile) => {
    if (err || !profile) {
      return res.redirect(`${WEBSITE_DOMAIN}/auth/login?oauth_error=1`)
    }
    req.user = profile
    next()
  })(req, res, next)
}, userController.socialAuthCallback)

// ── Verify OAuth ─────────────────────────────────────────────
// FE POST { userId } để nhận thông tin user đã đăng nhập qua OAuth
Router.route('/verify-oauth')
  .post(userController.verifyOAuth)

export const userRoute = Router