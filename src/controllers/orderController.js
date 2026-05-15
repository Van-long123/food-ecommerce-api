import { StatusCodes } from 'http-status-codes'
import { orderService } from '~/services/orderService'

const validateStock = async (req, res, next) => {
  try {
    const items = req.body.items || []
    const result = await orderService.validateStockBeforeCheckout(items)
    
    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Kiểm tra tồn kho thành công',
      data: result
    })
  } catch (error) {
    next(error)
  }
}

const createNew = async (req, res, next) => {
  try {
    const userId = req.jwtDecoded._id
    const payload = req.body
    
    const result = await orderService.createNew(userId, payload)
    
    res.status(StatusCodes.CREATED).json({
      success: true,
      message: 'Đặt hàng thành công',
      data: result
    })
  } catch (error) {
    next(error)
  }
}

export const orderController = {
  validateStock,
  createNew
}
