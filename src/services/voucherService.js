import { StatusCodes } from 'http-status-codes'
import { voucherModel } from '~/models/voucherModel'
import { voucherUsageModel } from '~/models/voucherUsageModel'
import ApiError from '~/utils/ApiError'

const parsePositiveInt = (val, defaultVal) => {
  const n = parseInt(val)
  return Number.isFinite(n) && n > 0 ? n : defaultVal
}

//  Chuẩn hóa danh sách sản phẩm từ giỏ hàng gửi lên.
const normalizeValidationItems = (items = []) => {
  return items
    .map((item) => {
      const productId = String(item.productId || item.id || '').trim()
      if (!productId) return null

      const quantity = Math.max(1, Number(item.quantity || 1))
      const price = Math.max(0, Number(item.price || 0))
      const lineTotal = price * quantity

      return {
        productId,
        categoryId: item.categoryId ? String(item.categoryId).trim() : '',
        quantity,
        price,
        lineTotal
      }
    })
    .filter(Boolean)
}

// kiểm tra xem một sản phẩm có nằm trong phạm vi áp dụng của Voucher hay không.
const isItemInVoucherScope = (voucher, item) => {
  if (voucher.applyFor === voucherModel.VOUCHER_APPLY_FOR.ALL) return true

  if (voucher.applyFor === voucherModel.VOUCHER_APPLY_FOR.CATEGORY) {
    return Boolean(item.categoryId) && voucher.applyForIds.includes(item.categoryId)
  }

  if (voucher.applyFor === voucherModel.VOUCHER_APPLY_FOR.PRODUCT) {
    return voucher.applyForIds.includes(item.productId)
  }

  return true
}

// Phân bổ tổng số tiền giảm giá cho từng sản phẩm đủ điều kiện.
const allocateDiscountBreakdown = (eligibleItems, discountAmount) => {
  const totalEligibleAmount = eligibleItems.reduce((sum, item) => sum + item.lineTotal, 0)
  if (!eligibleItems.length || discountAmount <= 0 || totalEligibleAmount <= 0) {
    return {}
  }

  const rawShares = eligibleItems.map((item) => {
    const exactShare = (discountAmount * item.lineTotal) / totalEligibleAmount
    return {
      productId: item.productId,
      exactShare,
      floorShare: Math.floor(exactShare),
      fraction: exactShare - Math.floor(exactShare)
    }
  })

  let allocatedTotal = rawShares.reduce((sum, item) => sum + item.floorShare, 0)
  let remainder = Math.max(0, Math.round(discountAmount) - allocatedTotal)

  rawShares
    .slice()
    .sort((a, b) => b.fraction - a.fraction || b.exactShare - a.exactShare)
    .forEach((item) => {
      if (remainder <= 0) return
      item.floorShare += 1
      remainder -= 1
    })

  return rawShares.reduce((result, item) => {
    result[item.productId] = item.floorShare
    return result
  }, {})
}

// ─── CLIENT ───────────────────────────────────────────────────────────────────

/**
 * Danh sách vouchers active cho client xem (không cần đăng nhập)
 * Query params: type, isFeatured, page, limit
 */
const getListClient = async (query) => {
  const page = parsePositiveInt(query.page, 1)
  const limit = parsePositiveInt(query.limit, 100)

  const now = new Date()
  const queryConditions = [
    { deleted: false },
    { status: voucherModel.VOUCHER_STATUSES.ACTIVE },
    { startDate: { $lte: now } },
    { endDate: { $gt: now } }
  ]

  if (query.type && Object.values(voucherModel.VOUCHER_TYPES).includes(query.type)) {
    queryConditions.push({ type: query.type })
  }

  if (query.isFeatured !== undefined) {
    queryConditions.push({ isFeatured: query.isFeatured === 'true' })
  }

  const { data, total } = await voucherModel.getList({
    queryConditions,
    page,
    limit,
    sort: { isFeatured: -1, endDate: 1 }
  })

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  }
}

/**
 * Validate mã giảm giá
 * Body: { code, orderValue }
 */
const validateVoucher = async ({ code, orderValue, items = [] }, accountId = null) => {
  if (!code) throw new ApiError(StatusCodes.BAD_REQUEST, 'Vui lòng nhập mã giảm giá!')
  
  const voucher = await voucherModel.findOneByCode(code)
  if (!voucher) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Mã giảm giá không tồn tại!')
  }

  const now = new Date()
  if (voucher.status !== voucherModel.VOUCHER_STATUSES.ACTIVE || now < new Date(voucher.startDate) || now > new Date(voucher.endDate)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Mã giảm giá đã hết hạn hoặc chưa có hiệu lực!')
  }

  if (voucher.usedCount >= voucher.quantity) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Mã giảm giá đã hết lượt sử dụng!')
  }


  if (accountId) {
    const usageCount = await voucherUsageModel.countUsageByUser(voucher._id, accountId)
    if (usageCount >= voucher.usageLimitPerUser) {
      throw new ApiError(StatusCodes.BAD_REQUEST, 'Bạn đã sử dụng hết lượt mã giảm giá này!')
    }
  }

  const normalizedItems = normalizeValidationItems(items)
  // Danh sách các sản phẩm thỏa mãn điều kiện 
  const eligibleItems = normalizedItems.filter((item) => isItemInVoucherScope(voucher, item))
  const eligibleSubtotal = eligibleItems.reduce((sum, item) => sum + item.lineTotal, 0)
  const orderSubtotal = Number(orderValue || 0)
  const scopedSubtotal = voucher.applyFor === voucherModel.VOUCHER_APPLY_FOR.ALL
    ? orderSubtotal
    : eligibleSubtotal
  const discountBaseAmount = scopedSubtotal > 0 ? scopedSubtotal : orderSubtotal

  if (
    normalizedItems.length > 0 &&
    voucher.applyFor !== voucherModel.VOUCHER_APPLY_FOR.ALL &&
    eligibleItems.length === 0
  ) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Mã giảm giá không áp dụng cho các sản phẩm trong giỏ hàng!')
  }

  if (scopedSubtotal < voucher.minOrderValue) {
    throw new ApiError(StatusCodes.BAD_REQUEST, `Đơn hàng tối thiểu để áp dụng mã này là ${voucher.minOrderValue.toLocaleString('vi-VN')}đ!`)
  }

  let discountAmount = 0
  if (voucher.type === voucherModel.VOUCHER_TYPES.MONEY) {
    discountAmount = voucher.discountValue
  } else if (voucher.type === voucherModel.VOUCHER_TYPES.PERCENT) {
    discountAmount = (discountBaseAmount * voucher.discountValue) / 100
    if (voucher.maxDiscountAmount != null) {
      discountAmount = Math.min(discountAmount, voucher.maxDiscountAmount)
    }
  } else if (voucher.type === voucherModel.VOUCHER_TYPES.FREESHIP) {
    discountAmount = voucher.discountValue 
  } else if (voucher.type === voucherModel.VOUCHER_TYPES.PRODUCT) {
    discountAmount = voucher.discountValue
  }

  discountAmount = Math.min(Math.round(discountAmount), discountBaseAmount)
  const discountBreakdown = allocateDiscountBreakdown(
    eligibleItems.length > 0 ? eligibleItems : normalizedItems,
    discountAmount
  )

  return {
    isValid: true,
    discountAmount,
    eligibleSubtotal: scopedSubtotal,
    discountBreakdown,
    voucher: {
      _id: voucher._id,
      code: voucher.code,
      name: voucher.name,
      type: voucher.type,
      discountValue: voucher.discountValue,
      maxDiscountAmount: voucher.maxDiscountAmount,
      minOrderValue: voucher.minOrderValue,
      applyFor: voucher.applyFor,
      applyForIds: voucher.applyForIds || []
    }
  }
}

// ─── ADMIN ────────────────────────────────────────────────────────────────────

const getListAdmin = async (query) => {
  const page = parsePositiveInt(query.page, 1)
  const limit = parsePositiveInt(query.limit, 20)
  const queryConditions = [{ deleted: false }]
  if (query.status) queryConditions.push({ status: query.status })
  if (query.type) queryConditions.push({ type: query.type })
  if (query.keyword) {
    queryConditions.push({
      $or: [
        { code: { $regex: new RegExp(query.keyword, 'i') } },
        { name: { $regex: new RegExp(query.keyword, 'i') } }
      ]
    })
  }
  const { data, total } = await voucherModel.getList({ queryConditions, page, limit })
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }
}

const createNew = async (reqBody, actorId) => {
  const data = {
    code: String(reqBody.code || '').toUpperCase().trim(),
    name: reqBody.name,
    description: reqBody.description || '',
    type: reqBody.type,
    discountValue: Number(reqBody.discountValue),
    maxDiscountAmount: reqBody.maxDiscountAmount != null ? Number(reqBody.maxDiscountAmount) : null,
    minOrderValue: Number(reqBody.minOrderValue || 0),
    applyFor: reqBody.applyFor || voucherModel.VOUCHER_APPLY_FOR.ALL,
    applyForIds: Array.isArray(reqBody.applyForIds) ? reqBody.applyForIds : [],
    startDate: new Date(reqBody.startDate),
    endDate: new Date(reqBody.endDate),
    status: reqBody.status || voucherModel.VOUCHER_STATUSES.ACTIVE,
    quantity: Number(reqBody.quantity),
    usedCount: 0,
    usageLimitPerUser: Number(reqBody.usageLimitPerUser || 1),
    isFeatured: Boolean(reqBody.isFeatured),
    createdBy: { account_id: actorId, createdAt: new Date() }
  }
  const existing = await voucherModel.findOneByCode(data.code)
  if (existing) throw new ApiError(StatusCodes.CONFLICT, `Mã voucher "${data.code}" đã tồn tại!`)
  return await voucherModel.createNew(data)
}

const updateVoucher = async (id, reqBody) => {
  const voucher = await voucherModel.findOneById(id)
  if (!voucher || voucher.deleted) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy voucher!')
  const updateData = { ...reqBody }
  delete updateData._id
  delete updateData.createdBy
  delete updateData.usedCount
  if (updateData.startDate) updateData.startDate = new Date(updateData.startDate)
  if (updateData.endDate) updateData.endDate = new Date(updateData.endDate)
  if (updateData.code) updateData.code = String(updateData.code).toUpperCase().trim()
  return await voucherModel.update(id, updateData)
}

const deleteVoucher = async (id) => {
  const voucher = await voucherModel.findOneById(id)
  if (!voucher || voucher.deleted) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy voucher!')
  return await voucherModel.softDelete(id)
}

export const voucherService = {
  getListClient,
  validateVoucher,
  getListAdmin,
  createNew,
  updateVoucher,
  deleteVoucher
}
