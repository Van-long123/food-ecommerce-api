import { StatusCodes } from 'http-status-codes'
import { orderModel } from '~/models/orderModel'
import { orderItemModel } from '~/models/orderItemModel'
import { productModel } from '~/models/productModel'
import ApiError from '~/utils/ApiError'

/**
 * Kiểm tra tồn kho thực tế trước khi checkout
 * @param {Array} items - [{ productId, quantity }, ...]
 * @returns { valid: [], clamped: [], outOfStock: [] }
 */
const validateStockBeforeCheckout = async (items = []) => {
  try {
    const productIds = Array.from(
      new Set(items.map((item) => String(item.productId || '')).filter(Boolean))
    )

    if (productIds.length === 0) {
      throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Danh sách sản phẩm trống')
    }

    const products = await productModel.findManyByIds(productIds)
    const productMap = new Map(products.map((p) => [p._id.toString(), p]))

    const result = {
      valid: [],
      clamped: [],
      outOfStock: []
    }

    items.forEach((item) => {
      const productId = String(item.productId || '')
      const requestedQty = Math.max(1, Number(item.quantity || 0))
      
      const product = productMap.get(productId)

      if (!product || product.deleted || product.status !== productModel.PRODUCT_STATUSES.ACTIVE) {
        result.outOfStock.push({
          productId,
          name: product?.title || 'Sản phẩm',
          currentStock: 0,
          reason: 'unavailable'
        })
        return
      }

      const stock = typeof product.stock === 'number' ? product.stock : 0

      if (stock <= 0) {
        result.outOfStock.push({
          productId,
          name: product.title || 'Sản phẩm',
          currentStock: 0,
          reason: 'out_of_stock'
        })
        return
      }

      // Trường hợp Thiếu hàng (Muốn 100kg nhưng chỉ còn 10kg)
      if (requestedQty > stock) {
        result.clamped.push({
          productId,
          name: product.title || 'Sản phẩm',
          requestedQty,
          currentStock: stock,
          reason: 'insufficient_stock'
        })
        return
      }

      result.valid.push({
        productId,
        name: product.title || 'Sản phẩm',
        currentStock: stock,
        quantity: requestedQty
      })
    })

    return result
  } catch (error) {
    throw error
  }
}

const createNew = async (userId, payload) => {
  try {
    const { products, ...orderInfo } = payload

    const orderData = {
      ...orderInfo,
      userId
    }
    
    // 1. Save order info
    const orderResult = await orderModel.createNew(orderData)
    const orderId = orderResult.insertedId.toString()

    // 2. Prepare order items
    const orderItems = products.map(item => ({
      orderId,
      productId: item.id.toString(), // Chuyển sang string cho thống nhất model
      title: item.title,
      thumbnail: item.thumbnail,
      quantity: item.quantity,
      price: item.priceNew,
      totalPrice: item.totalPrice
    }))

    // 3. Save order items
    await orderItemModel.createMany(orderItems)
    
    // Future: Reduce stock, remove from cart, clear voucher usage, etc.
    
    return {
      ...orderResult,
      orderId
    }
  } catch (error) {
    throw error
  }
}

export const orderService = {
  validateStockBeforeCheckout,
  createNew
}

