import { StatusCodes } from 'http-status-codes'
import ApiError from '~/utils/ApiError'
import { cartModel } from '~/models/cartModel'
import { productModel } from '~/models/productModel'

const normalizeCartItems = async (items = []) => {
  const productIds = Array.from(
    new Set(items.map((item) => String(item.productId || '')).filter(Boolean))
  )

  const products = await productModel.findManyByIds(productIds)
  const productMap = new Map(products.map((p) => [p._id.toString(), p]))

  const adjustments = { clamped: [], removed: [] }
  const normalized = []

  items.forEach((item) => {
    const productId = String(item.productId || '')
    if (!productId) return

    const product = productMap.get(productId)
    if (!product || product.deleted || product.status !== productModel.PRODUCT_STATUSES.ACTIVE) {
      adjustments.removed.push({ productId, name: product?.title || 'Sản phẩm', reason: 'unavailable' })
      return
    }

    const stock = typeof product.stock === 'number' ? product.stock : 0
    if (stock <= 0) {
      adjustments.removed.push({ productId, name: product.title || 'Sản phẩm', reason: 'out_of_stock' })
      return
    }

    const desiredQty = Math.max(1, Number(item.quantity || 1))
    const nextQty = Math.min(desiredQty, stock)

    if (nextQty !== desiredQty) {
      adjustments.clamped.push({ productId, name: product.title || '', from: desiredQty, to: nextQty, reason: 'stock' })
    }

    const price = Number(product.price || 0)
    const originalPrice = Number(product.originalPrice || 0)

    normalized.push({
      productId,
      name: product.title || '',
      image: product.thumbnail || '',
      price,
      originalPrice: originalPrice > price ? originalPrice : null,
      stock,
      quantity: nextQty,
      slug: product.slug || '',
      unit: product.unit || '',
      categoryId: product.primary_category_id ? String(product.primary_category_id) : ''
    })
  })

  return { items: normalized, adjustments }
}

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

const getCart = async (userId) => {
  const cart = await cartModel.findByUserId(userId)
  const rawItems = Array.isArray(cart?.items) ? cart.items : []

  const { items, adjustments } = await normalizeCartItems(rawItems)

  if (adjustments.clamped.length > 0 || adjustments.removed.length > 0) {
    const nextItems = buildPersistItems(items, rawItems)
    await cartModel.upsertItems(userId, nextItems)
  }

  return buildCartResponse(items, adjustments)
}

const addItem = async (userId, payload) => {
  const productId = String(payload.productId || '')
  const quantity = Math.max(1, Number(payload.quantity || 1))

  if (!productId) throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Thiếu mã sản phẩm')

  const cart = await cartModel.findByUserId(userId)
  const rawItems = Array.isArray(cart?.items) ? cart.items : []

  const nextItems = rawItems.map((item) => ({ ...item }))
  const existing = nextItems.find((item) => String(item.productId) === productId)

  if (existing) {
    existing.quantity = Number(existing.quantity || 0) + quantity
  } else {
    nextItems.push({ productId, quantity, addedAt: new Date() })
  }

  const { items, adjustments } = await normalizeCartItems(nextItems)
  if (!items.length) {
    await cartModel.upsertItems(userId, [])
    throw new ApiError(StatusCodes.CONFLICT, 'Sản phẩm đã hết hàng')
  }

  const persisted = buildPersistItems(items, nextItems)
  await cartModel.upsertItems(userId, persisted)

  return buildCartResponse(items, adjustments)
}

const updateItemQuantity = async (userId, productId, quantity) => {
  const cart = await cartModel.findByUserId(userId)
  const rawItems = Array.isArray(cart?.items) ? cart.items : []

  const nextItems = rawItems.map((item) => ({ ...item }))
  const index = nextItems.findIndex((item) => String(item.productId) === String(productId))

  if (index === -1) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy sản phẩm trong giỏ')

  if (Number(quantity) <= 0) {
    nextItems.splice(index, 1)
  } else {
    nextItems[index].quantity = Number(quantity)
  }

  const { items, adjustments } = await normalizeCartItems(nextItems)
  const persisted = buildPersistItems(items, nextItems)
  await cartModel.upsertItems(userId, persisted)

  return buildCartResponse(items, adjustments)
}

const removeItem = async (userId, productId) => {
  const cart = await cartModel.findByUserId(userId)
  const rawItems = Array.isArray(cart?.items) ? cart.items : []
  const nextItems = rawItems.filter((item) => String(item.productId) !== String(productId))

  const { items, adjustments } = await normalizeCartItems(nextItems)
  const persisted = buildPersistItems(items, nextItems)
  await cartModel.upsertItems(userId, persisted)

  return buildCartResponse(items, adjustments)
}

const removeItems = async (userId, productIds = []) => {
  // Convert list ID → Set 
  const removeSet = new Set(productIds.map((id) => String(id)))
  const cart = await cartModel.findByUserId(userId)
  const rawItems = Array.isArray(cart?.items) ? cart.items : []
  const nextItems = rawItems.filter((item) => !removeSet.has(String(item.productId)))  // O(1) còn list productIds.includes(id) // O(n)

  const { items, adjustments } = await normalizeCartItems(nextItems)
  const persisted = buildPersistItems(items, nextItems)
  await cartModel.upsertItems(userId, persisted)

  return buildCartResponse(items, adjustments)
}

const mergeGuestCart = async (userId, guestItems = []) => {
  const cart = await cartModel.findByUserId(userId)
  const rawItems = Array.isArray(cart?.items) ? cart.items : []

  const merged = new Map()
  rawItems.forEach((item) => {
    merged.set(String(item.productId), {
      quantity: Number(item.quantity || 0),
      addedAt: item.addedAt
    })
  })
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

  // Convert Map → Array
  const combinedItems = Array.from(merged.entries()).map(([productId, data]) => ({
    productId,
    quantity: data.quantity,
    addedAt: data.addedAt || new Date()
  }))

  const { items, adjustments } = await normalizeCartItems(combinedItems)
  const persisted = buildPersistItems(items, combinedItems)
  await cartModel.upsertItems(userId, persisted)

  return buildCartResponse(items, adjustments)
}

const validateGuestCart = async (guestItems = []) => {
  const cleaned = guestItems.map((item) => ({
    productId: String(item.productId || ''),
    quantity: Number(item.quantity || 1)
  }))

  const { items, adjustments } = await normalizeCartItems(cleaned)
  return buildCartResponse(items, adjustments)
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
