import { StatusCodes } from 'http-status-codes'
import ApiError from '~/utils/ApiError'
import { cartModel } from '~/models/cartModel'
import { productModel } from '~/models/productModel'

/**
 * Xây dựng danh sách sản phẩm để lưu vào database
 * Giữ nguyên ngày thêm sản phẩm (addedAt) nếu sản phẩm đã tồn tại trong giỏ hàng */
const buildPersistItems = (normalizedItems, existingItems) => {
  const existingMap = new Map(
    (existingItems || []).map((item) => [String(item.productId || ''), item])
  )

  return normalizedItems.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
    addedAt: existingMap.get(item.productId)?.addedAt || new Date()
  }))
}

/**
 * Chuẩn hóa các sản phẩm trong giỏ hàng:
 * - Kiểm tra sự tồn tại và trạng thái của sản phẩm
 * - Xử lý trường hợp hết hàng hoặc vượt quá số lượng tồn kho
 * - Lưu lại các thay đổi (adjustments) để thông báo cho người dùng */
const normalizeCartItems = async (items = [], options = {}) => {
  const { userId = null, persist = false } = options

  try {
    const productIds = Array.from(
      new Set(items.map((item) => String(item.productId || '')).filter(Boolean))
    )

    // Lấy thông tin chi tiết của tất cả sản phẩm trong giỏ hàng
    const products = await productModel.findManyByIds(productIds)
    const productMap = new Map(products.map((p) => [p._id.toString(), p]))

    const adjustments = { clamped: [], removed: [] }
    const normalized = []

    items.forEach((item) => {
      const productId = String(item.productId || '')
      if (!productId) return

      const product = productMap.get(productId)

      // Xóa cứng: sản phẩm không tồn tại, đã bị xóa hoặc không hoạt động
      if (!product || product.deleted || product.status !== productModel.PRODUCT_STATUSES.ACTIVE) {
        adjustments.removed.push({ productId, name: product?.title || 'Sản phẩm', reason: 'unavailable' })
        return
      }

      const stock = typeof product.stock === 'number' ? product.stock : 0

      const desiredQty = Math.max(1, Number(item.quantity || 1))

      // Xử lý mềm: giữ sản phẩm trong giỏ nhưng đánh dấu hết hàng (stock <= 0)
      if (stock <= 0) {
        normalized.push({
          productId,
          name: product.title || '',
          image: product.thumbnail || '',
          price: Number(product.price || 0),
          originalPrice: (Number(product.originalPrice || 0) > Number(product.price || 0)) ? Number(product.originalPrice || 0) : null,
          stock: 0,
          quantity: desiredQty,
          slug: product.slug || '',
          unit: product.unit || '',
          categoryId: product.primary_category_id ? String(product.primary_category_id) : ''
        })
        return
      }

      // Tự động điều chỉnh số lượng nếu yêu cầu vượt quá tồn kho
      let nextQty = desiredQty
      if (desiredQty > stock) {
        nextQty = stock
        adjustments.clamped.push({ productId, name: product.title || '', oldQty: desiredQty, newQty: nextQty })
      }

      normalized.push({
        productId,
        name: product.title || '',
        image: product.thumbnail || '',
        price: Number(product.price || 0),
        originalPrice: (Number(product.originalPrice || 0) > Number(product.price || 0)) ? Number(product.originalPrice || 0) : null,
        stock,
        quantity: nextQty,
        slug: product.slug || '',
        unit: product.unit || '',
        categoryId: product.primary_category_id ? String(product.primary_category_id) : ''
      })
    })

    // Lưu lại giỏ hàng đã chuẩn hóa vào Database nếu có yêu cầu (thường dùng cho user đã đăng nhập)
    if (persist && userId) {
      const persistItems = buildPersistItems(normalized, items)
      await cartModel.upsertItems(userId, persistItems)
    }

    return { items: normalized, adjustments }
  } catch (err) {
    throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, err.message || 'Lỗi khi xử lý giỏ hàng')
  }
}

/**
 * Xây dựng cấu trúc phản hồi cho client bao gồm tổng số lượng và các điều chỉnh */
const buildCartResponse = (items, adjustments) => {
  const totalCartItems = items.length
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0)

  return {
    items,
    totalCartItems,
    totalQuantity,
    adjustments
  }
}

/**
 * Lấy giỏ hàng của người dùng theo userId */
const getCart = async (userId) => {
  const cart = await cartModel.findByUserId(userId)
  const rawItems = Array.isArray(cart?.items) ? cart.items : []

  // Chuẩn hóa giỏ hàng và cập nhật lại vào DB
  const { items, adjustments } = await normalizeCartItems(rawItems, { userId, persist: true })

  return buildCartResponse(items, adjustments)
}

/**
 * Thêm sản phẩm vào giỏ hàng */
const addItem = async (userId, payload) => {
  const productId = String(payload.productId || '')
  const quantity = Math.max(1, Number(payload.quantity || 1))

  if (!productId) throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Thiếu mã sản phẩm')

  // KIỂM TRA TỒN KHO THỜI GIAN THỰC TRƯỚC KHI XỬ LÝ
  const product = await productModel.findOneById(productId)
  if (!product || product.deleted || product.status !== productModel.PRODUCT_STATUSES.ACTIVE) {
    throw new ApiError(StatusCodes.GONE, 'Sản phẩm không còn tồn tại hoặc đã ngừng kinh doanh')
  }

  const stock = Number(product.stock || 0)
  if (stock <= 0) {
    throw new ApiError(StatusCodes.CONFLICT, `Sản phẩm "${product.title}" đã hết hàng`)
  }

  const cart = await cartModel.findByUserId(userId)
  const rawItems = Array.isArray(cart?.items) ? cart.items : []

  // Kiểm tra xem sản phẩm đã có trong cart chưa
  const existing = rawItems.find((item) => String(item.productId) === productId)
  const currentQty = existing ? Number(existing.quantity || 0) : 0
  const totalQty = currentQty + quantity

  // Logic tự động điều chỉnh (Self-healing):
  const nextItems = rawItems.map((item) => ({ ...item }))
  const existingIdx = nextItems.findIndex((item) => String(item.productId) === productId)

  if (existingIdx !== -1) {
    nextItems[existingIdx].quantity = totalQty
  } else {
    nextItems.push({ productId, quantity, addedAt: new Date() })
  }

  // Chuẩn hóa và lưu vào Database (Tự động đưa 4 về 3 nếu kho chỉ còn 3)
  const { items, adjustments } = await normalizeCartItems(nextItems, { userId, persist: true })

  // Thông báo nếu bị giới hạn tồn kho
  const clamped = adjustments.clamped?.find((a) => a.productId === productId)
  if (clamped) {
    return {
      ...buildCartResponse(items, adjustments),
      message: `Đã đạt giới hạn tồn kho (${stock} sản phẩm)`
    }
  }

  return buildCartResponse(items, adjustments)
}

/**
 * Cập nhật số lượng của một sản phẩm trong giỏ hàng */
const updateItemQuantity = async (userId, productId, quantity) => {
  const cart = await cartModel.findByUserId(userId)
  const rawItems = Array.isArray(cart?.items) ? cart.items : []

  const nextItems = rawItems.map((item) => ({ ...item }))
  const index = nextItems.findIndex((item) => String(item.productId) === String(productId))

  if (index === -1) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy sản phẩm trong giỏ')

  // Nếu số lượng <= 0 thì xóa sản phẩm khỏi giỏ hàng
  if (Number(quantity) <= 0) {
    nextItems.splice(index, 1)
  } else {
    nextItems[index].quantity = Number(quantity)
  }

  const { items, adjustments } = await normalizeCartItems(nextItems, { userId, persist: true })

  // Nếu số lượng bị điều chỉnh do vượt quá tồn kho
  const clamped = adjustments.clamped?.find((a) => a.productId === productId)
  if (clamped) {
    return {
      ...buildCartResponse(items, adjustments),
      message: `Đã đạt giới hạn tồn kho (${clamped.newQty} sản phẩm)`
    }
  }

  return buildCartResponse(items, adjustments)
}

/**
 * Xóa một sản phẩm khỏi giỏ hàng */
const removeItem = async (userId, productId) => {
  const cart = await cartModel.findByUserId(userId)
  const rawItems = Array.isArray(cart?.items) ? cart.items : []
  const nextItems = rawItems.filter((item) => String(item.productId) !== String(productId))

  const { items, adjustments } = await normalizeCartItems(nextItems, { userId, persist: true })
  return buildCartResponse(items, adjustments)
}

/**
 * Xóa nhiều sản phẩm khỏi giỏ hàng (thường dùng sau khi đặt hàng thành công) */
const removeItems = async (userId, productIds = []) => {
  const removeSet = new Set(productIds.map((id) => String(id)))
  const cart = await cartModel.findByUserId(userId)
  const rawItems = Array.isArray(cart?.items) ? cart.items : []
  const nextItems = rawItems.filter((item) => !removeSet.has(String(item.productId)))

  const { items, adjustments } = await normalizeCartItems(nextItems, { userId, persist: true })
  return buildCartResponse(items, adjustments)
}

/**
 * Hợp nhất giỏ hàng của khách (guest) vào giỏ hàng của người dùng khi đăng nhập */
const mergeGuestCart = async (userId, guestItems = []) => {
  const cart = await cartModel.findByUserId(userId)
  const rawItems = Array.isArray(cart?.items) ? cart.items : []

  const merged = new Map()
  // Cho sản phẩm hiện có vào Map
  rawItems.forEach((item) => {
    merged.set(String(item.productId), {
      quantity: Number(item.quantity || 0),
      addedAt: item.addedAt
    })
  })
  // Cộng dồn sản phẩm từ giỏ hàng khách
  guestItems.forEach((item) => {
    const key = String(item.productId || '')
    if (!key) return
    const prev = merged.get(key)
    if (prev) {
      merged.set(key, { ...prev, quantity: prev.quantity + Number(item.quantity || 0) })
    } else {
      merged.set(key, { quantity: Number(item.quantity || 0), addedAt: item.addedAt || new Date() })
    }
  })

  // Chuyển Map thành Array để chuẩn hóa
  const combinedItems = Array.from(merged.entries()).map(([productId, data]) => ({
    productId,
    quantity: data.quantity,
    addedAt: data.addedAt || new Date()
  }))

  const { items, adjustments } = await normalizeCartItems(combinedItems, { userId, persist: true })
  return buildCartResponse(items, adjustments)
}

/**
 * Kiểm tra và chuẩn hóa giỏ hàng cho khách (không lưu vào DB) */
const validateGuestCart = async (guestItems = []) => {
  const cleaned = guestItems.map((item) => ({
    productId: String(item.productId || ''),
    quantity: Number(item.quantity || 1)
  }))

  const { items, adjustments } = await normalizeCartItems(cleaned)
  
  // Xử lý thông báo nếu có sản phẩm bị điều chỉnh số lượng
  let message = null
  if (adjustments.clamped?.length > 0) {
    const firstClamped = adjustments.clamped[0]
    message = `Đã đạt giới hạn tồn kho (${firstClamped.newQty} sản phẩm)`
  }

  // Lưu ý: Đối với Guest, nếu sản phẩm bị removed (inactive/deleted), 
  // chúng ta cũng trả về bình thường để Frontend tự xử lý xóa khỏi LocalStorage thông qua applyCartResponse
  return {
    ...buildCartResponse(items, adjustments),
    message
  }
}

export const cartService = {
  getCart,
  addItem,
  updateItemQuantity,
  removeItem,
  removeItems,
  mergeGuestCart,
  validateGuestCart
}
