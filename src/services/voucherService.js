import { StatusCodes } from 'http-status-codes'
import { voucherModel } from '~/models/voucherModel'
import ApiError from '~/utils/ApiError'

const parsePositiveInt = (val, defaultVal) => {
  const n = parseInt(val)
  return Number.isFinite(n) && n > 0 ? n : defaultVal
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
  getListAdmin,
  createNew,
  updateVoucher,
  deleteVoucher
}
