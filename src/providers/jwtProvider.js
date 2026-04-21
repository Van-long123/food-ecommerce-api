import jwt from 'jsonwebtoken'

const generateToken = async (userInfo, secretSignature, tokenLife) => {
  try {
    return jwt.sign(userInfo, secretSignature, { algorithm: 'HS256', expiresIn: tokenLife })
  } catch (error) {
    throw new Error(error)
  }
}

const verifyToken = async (token, secretSignature) => {
  try {
    return jwt.verify(token, secretSignature)
  } catch (error) {
    throw new Error(error)
  }
}

export const jwtProvider = {
  generateToken,
  verifyToken
}
