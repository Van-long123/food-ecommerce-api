import { orderModel } from '~/models/orderModel'

const createNew = async (userId, payload) => {
  try {
    const orderData = {
      ...payload,
      userId
    }
    
    // Save order
    const result = await orderModel.createNew(orderData)
    
    // Future: Reduce stock, remove from cart, clear voucher usage, etc.
    // For now we just create the order
    
    return result
  } catch (error) {
    throw error
  }
}

export const orderService = {
  createNew
}
