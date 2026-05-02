import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { Strategy as FacebookStrategy } from 'passport-facebook'
import { env } from '~/config/environment'
import { userModel } from '~/models/userModel'

// Google OAuth2 Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackURL: 'http://localhost:8017/v1/client/users/google/callback',
      scope: ['profile', 'email']
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value
        const avatar = profile.photos?.[0]?.value

        const socialProfile = {
          socialId: profile.id,
          provider: 'google',
          email: email || null,
          displayName: profile.displayName || email?.split('@')[0] || 'Google User',
          avatar: avatar || null
        }

        return done(null, socialProfile)
      } catch (error) {
        return done(error, false)
      }
    }
  )
)

// Facebook OAuth2 Strategy
passport.use(
  new FacebookStrategy(
    {
      clientID: env.FACEBOOK_CLIENT_ID,
      clientSecret: env.FACEBOOK_CLIENT_SECRET,
      callbackURL: 'http://localhost:8017/v1/client/users/facebook/callback',
      profileFields: ['id', 'emails', 'name', 'displayName', 'photos']
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value || null
        const avatar = profile.photos?.[0]?.value || null
        const displayName =
          profile.displayName ||
          `${profile.name?.givenName || ''} ${profile.name?.familyName || ''}`.trim() ||
          'Facebook User'

        const socialProfile = {
          socialId: profile.id,
          provider: 'facebook',
          email,
          displayName,
          avatar
        }

        return done(null, socialProfile)
      } catch (error) {
        return done(error, false)
      }
    }
  )
)

export default passport
