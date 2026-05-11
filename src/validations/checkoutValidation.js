import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import ApiError from '~/utils/ApiError'

const getShippingFee = async (req, res, next) => {
  const schema = Joi.object({
    addressId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        'string.pattern.base': 'addressId không hợp lệ',
        'any.required': 'addressId là bắt buộc'
      }),
    // Sản phẩm trong giỏ hàng — dùng để GHN tính phí chính xác hơn
    products: Joi.array()
      .items(
        Joi.object({
          _id:        Joi.string().required(),
          name:       Joi.string().required(),
          quantity:   Joi.number().integer().min(1).required()
        })
      )
      .optional()
  })

  try {
    await schema.validateAsync(req.body, { abortEarly: false })
    next()
  } catch (error) {
    next(new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, error.message))
  }
}

export const checkoutValidation = {
  getShippingFee
}
