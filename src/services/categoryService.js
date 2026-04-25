import { StatusCodes } from 'http-status-codes'
import { categoryModel } from '~/models/categoryModel'
import ApiError from '~/utils/ApiError'
import { slugify } from '~/utils/formatters'

// ─── Helper: generate unique slug ─────────────────────────────────────────────
const generateUniqueSlug = async (title, providedSlug) => {
  const baseSlug = providedSlug ? slugify(providedSlug) : slugify(title)
  const existing = await categoryModel.findOneBySlugAny(baseSlug)
  return existing ? `${baseSlug}-${Date.now()}` : baseSlug
}

// ─── ADMIN: Create ────────────────────────────────────────────────────────────
const createNew = async (reqBody, actorId) => {
  try {
    const slug = await generateUniqueSlug(reqBody.title, reqBody.slug)

    const newCategory = {
      title: reqBody.title,
      slug,
      type: reqBody.type,
      description: reqBody.description || '',
      thumbnail: reqBody.thumbnail || '',
      status: reqBody.status || 'active',
      featured: reqBody.featured ?? false,
      position: reqBody.position ?? 0,
      parent_id: reqBody.parent_id || null,
      createdBy: { account_id: actorId, createdAt: new Date() }
    }

    const created = await categoryModel.createNew(newCategory)
    return await categoryModel.findOneById(created.insertedId)
  } catch (error) {
    throw error
  }
}

// ─── ADMIN: Get list — dùng aggregate + $facet từ model ───────────────────────
const getListAdmin = async (query) => {
  try {
    const page = parseInt(query.page) || 1
    const limit = parseInt(query.limit) || 10
    const sortField = query.sortField || 'position'
    const sortOrder = query.sortOrder === 'desc' ? -1 : 1

    // Xây dựng queryConditions kiểu array (giống boardModel.getBoards)
    const queryConditions = [{ deleted: false }]
    if (query.type) queryConditions.push({ type: query.type })
    if (query.status) queryConditions.push({ status: query.status })
    if (query.featured !== undefined) queryConditions.push({ featured: query.featured === 'true' })
    if (query.keyword) {
      queryConditions.push({
        $or: [
          { title: { $regex: new RegExp(query.keyword, 'i') } },
          { description: { $regex: new RegExp(query.keyword, 'i') } }
        ]
      })
    }

    const { data, total } = await categoryModel.getList({ queryConditions, page, limit, sort: { [sortField]: sortOrder } })
    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    }
  } catch (error) {
    throw error
  }
}

// ─── ADMIN: Get detail by ID ──────────────────────────────────────────────────
const getDetailAdmin = async (id) => {
  try {
    const category = await categoryModel.findOneById(id)
    if (!category || category.deleted) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy category!')
    return category
  } catch (error) {
    throw error
  }
}

// ─── ADMIN: Update ────────────────────────────────────────────────────────────
const update = async (id, reqBody, actorId) => {
  try {
    const category = await categoryModel.findOneById(id)
    if (!category || category.deleted) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy category!')

    const updateData = { ...reqBody, updatedAt: new Date() }
    delete updateData.createdBy
    delete updateData.createdAt

    // Xử lý slug
    if (reqBody.title && !reqBody.slug) {
      updateData.slug = await generateUniqueSlug(reqBody.title, null)
    } else if (reqBody.slug) {
      const slugCandidate = slugify(reqBody.slug)
      const existing = await categoryModel.findOneBySlugAny(slugCandidate)
      updateData.slug = (existing && existing._id.toString() !== id)
        ? `${slugCandidate}-${Date.now()}`
        : slugCandidate
    }

    await categoryModel.pushUpdatedBy(id, actorId)
    return await categoryModel.update(id, updateData)
  } catch (error) {
    throw error
  }
}

// ─── ADMIN: Soft Delete ───────────────────────────────────────────────────────
const softDelete = async (id, actorId) => {
  try {
    const category = await categoryModel.findOneById(id)
    if (!category || category.deleted) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy category!')
    return await categoryModel.softDelete(id, actorId)
  } catch (error) {
    throw error
  }
}

// ─── CLIENT: Get list (active only) ──────────────────────────────────────────
const getListClient = async (query) => {
  try {
    const page = parseInt(query.page) || 1
    const limit = parseInt(query.limit) || 10

    const queryConditions = [{ deleted: false }, { status: 'active' }]
    if (query.type) queryConditions.push({ type: query.type })
    if (query.featured !== undefined) queryConditions.push({ featured: query.featured === 'true' })

    const { data, total } = await categoryModel.getList({
      queryConditions, page, limit, sort: { position: 1 }
    })
    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    }
  } catch (error) {
    throw error
  }
}

// ─── CLIENT: Get detail by slug (includes parent info via aggregate) ───────────
const getDetailClient = async (slug) => {
  try {
    const category = await categoryModel.findOneBySlug(slug)
    if (!category) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy category!')
    return category
  } catch (error) {
    throw error
  }
}

export const categoryService = {
  createNew,
  getListAdmin,
  getDetailAdmin,
  update,
  softDelete,
  getListClient,
  getDetailClient
}
