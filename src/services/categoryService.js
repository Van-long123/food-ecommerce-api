import { StatusCodes } from 'http-status-codes'
import { categoryModel } from '~/models/categoryModel'
import { productModel } from '~/models/productModel'
import { userModel } from '~/models/userModel'
import ApiError from '~/utils/ApiError'
import { slugify } from '~/utils/formatters'
import { CloudinaryProvider } from '~/providers/CloudinaryProvider'
import { parseBool, parseNum, parsePositiveInt, toNumberOrNull } from '~/utils/parsers'

// ─── Helper: generate unique slug ─────────────────────────────────────────────
const generateUniqueSlug = async (title, providedSlug) => {
  const baseSlug = providedSlug ? slugify(providedSlug) : slugify(title)
  const existing = await categoryModel.findOneBySlugAny(baseSlug)
  return existing ? `${baseSlug}-${Date.now()}` : baseSlug
}

const normalizeParentId = (value) => {
  if (value === undefined) return undefined
  if (value === null) return null
  const normalized = String(value).trim()
  if (!normalized || normalized === 'null') return null
  return normalized
}

const uploadCategoryImage = async (file, folderName) => {
  if (!file) return ''
  const result = await CloudinaryProvider.streamUpload(file.buffer, folderName, file.mimetype)
  return result?.secure_url || ''
}

const uploadCategoryField = async (files, fieldName, existingValue = '') => {
  const fieldFiles = files?.[fieldName] || []
  if (fieldFiles.length > 0) {
    return await uploadCategoryImage(fieldFiles[0], 'smartfood-categories')
  }
  return existingValue
}

// ─── ADMIN: Create ────────────────────────────────────────────────────────────
const createNew = async (reqBody, actorId, files = null) => {
  try {
    const slug = await generateUniqueSlug(reqBody.title, reqBody.slug)

    const actor = await userModel.findOneById(actorId)
    if (!actor) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy tài khoản người thực hiện!')

    const thumbnailFromBody = reqBody.thumbnail_url || reqBody.thumbnail || ''
    const bannerFromBody = reqBody.bannerImage_url || reqBody.bannerImage || ''
    const thumbnail = await uploadCategoryField(files, 'thumbnail', thumbnailFromBody)
    const bannerImage = await uploadCategoryField(files, 'bannerImage', bannerFromBody)

    let position = reqBody.position;
    if (position === undefined || position === null || position === '') {
      const maxPos = await categoryModel.getMaxPosition();
      position = maxPos + 1;
    } else {
      position = parseNum(reqBody.position, 0);
    }

    const newCategory = {
      title: reqBody.title,
      slug,
      type: reqBody.type,
      description: reqBody.description || '',
      thumbnail,
      bannerImage,
      badgeText: reqBody.badgeText || '',
      status: reqBody.status || 'active',
      featured: parseBool(reqBody.featured),
      position,
      parent_id: normalizeParentId(reqBody.parent_id),
      createdBy: { account_id: actorId, email: actor.email }
    }

    const created = await categoryModel.createNew(newCategory)
    const category = await categoryModel.findOneById(created.insertedId)
    if (!category) return null

    return category
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
    const searchQuery = String(query.searchQuery || query.keyword || '').trim()
    const typeFilter = query.typeFilter || query.type
    const statusFilter = query.statusFilter || query.status

    // Xây dựng queryConditions kiểu array (giống boardModel.getBoards)
    const queryConditions = [{ deleted: false }]
    if (typeFilter && typeFilter !== 'all') queryConditions.push({ type: typeFilter })
    if (statusFilter && statusFilter !== 'all') queryConditions.push({ status: statusFilter })
    if (query.featured !== undefined) queryConditions.push({ featured: query.featured === 'true' })
    if (searchQuery) {
      queryConditions.push({
        $or: [
          { title: { $regex: new RegExp(searchQuery, 'i') } },
          { slug: { $regex: new RegExp(searchQuery, 'i') } },
          { description: { $regex: new RegExp(searchQuery, 'i') } },
          { badgeText: { $regex: new RegExp(searchQuery, 'i') } }
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

    let parent = null
    if (category.parent_id) {
      parent = await categoryModel.findOneById(category.parent_id.toString())
      if (parent && parent.deleted) parent = null
    }

    return {
      ...category,
      parent
    }
  } catch (error) {
    throw error
  }
}

// ─── ADMIN: Update ────────────────────────────────────────────────────────────
const update = async (id, reqBody, actorId, files = null) => {
  try {
    const category = await categoryModel.findOneById(id)
    if (!category || category.deleted) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy category!')

    const actor = await userModel.findOneById(actorId)
    if (!actor) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy tài khoản người thực hiện!')

    const updateData = { ...reqBody, updatedAt: new Date() }
    delete updateData.createdBy
    delete updateData.createdAt

    const thumbnailFromBody = reqBody.thumbnail_url || reqBody.thumbnail || category.thumbnail || ''
    const bannerFromBody = reqBody.bannerImage_url || reqBody.bannerImage || category.bannerImage || ''

    updateData.thumbnail = await uploadCategoryField(files, 'thumbnail', thumbnailFromBody)
    updateData.bannerImage = await uploadCategoryField(files, 'bannerImage', bannerFromBody)
    updateData.badgeText = reqBody.badgeText ?? category.badgeText ?? ''
    updateData.featured = parseBool(reqBody.featured ?? category.featured)
    updateData.position = reqBody.position !== undefined ? parseNum(reqBody.position, category.position || 0) : category.position || 0
    updateData.parent_id = normalizeParentId(reqBody.parent_id)

    if (updateData.parent_id === undefined) {
      updateData.parent_id = category.parent_id ? category.parent_id.toString() : null
    }

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

    await categoryModel.pushUpdatedBy(id, actorId, actor.email)
    await categoryModel.update(id, updateData)
    return await categoryModel.findOneById(id)
  } catch (error) {
    throw error
  }
}

// ─── ADMIN: Soft Delete ───────────────────────────────────────────────────────
const softDelete = async (id, actorId) => {
  try {
    const category = await categoryModel.findOneById(id)
    if (!category || category.deleted) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy category!')

    const actor = await userModel.findOneById(actorId)
    if (!actor) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy tài khoản người thực hiện!')

    return await categoryModel.softDelete(id, actorId, actor.email)
  } catch (error) {
    throw error
  }
}

const bulkUpdateStatusAdmin = async (reqBody) => {
  try {
    const result = await categoryModel.bulkUpdateStatus(reqBody.category_ids, reqBody.status)
    return { updatedCount: result.modifiedCount || 0 }
  } catch (error) {
    throw error
  }
}

const bulkDeleteAdmin = async (reqBody, actorId) => {
  try {
    const actor = await userModel.findOneById(actorId)
    if (!actor) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy tài khoản người thực hiện!')

    const result = await categoryModel.bulkSoftDelete(reqBody.category_ids, actorId, actor.email)
    return { deletedCount: result.modifiedCount || 0 }
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

// ─── CLIENT: Category Products Page ───────────────────────────────────────────
const getProductsClient = async (slug, query = {}) => {
  try {
    const category = await categoryModel.findOneBySlug(slug)
    if (!category || category.deleted) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy category!')
    if (category.status !== categoryModel.CATEGORY_STATUSES.ACTIVE) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Danh mục hiện không khả dụng!')
    }
    if (category.type !== categoryModel.CATEGORY_TYPES.PRODUCT) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Danh mục không hợp lệ!')
    }

    const page = parsePositiveInt(query.page, 1)
    const limit = parsePositiveInt(query.limit, 15)
    const filter = String(query.filter || 'all')
    const sortBy = String(query.sortBy || query.sort || 'popular')

    const minPrice = toNumberOrNull(query.minPrice)
    const maxPrice = toNumberOrNull(query.maxPrice)

    const brands = (() => {
      if (Array.isArray(query.brands)) return query.brands
      if (typeof query.brands === 'string') return query.brands.split(',')
      if (typeof query.brand === 'string') return query.brand.split(',')
      return []
    })()

    const { data, total, priceStats } = await productModel.getListByPrimaryCategory({
      categoryId: category._id,
      page,
      limit,
      filter,
      sortBy,
      minPrice,
      maxPrice,
      brands
    })

    const products = data.map((item) => {
      const price = toNumberOrNull(item.price) || 0
      const originalPrice = toNumberOrNull(item.originalPrice)
      const normalizedOriginal = originalPrice && originalPrice > price ? originalPrice : null
      const discountPercent = toNumberOrNull(item.discountPercentage)

      return {
        id: item._id?.toString?.() || String(item._id || ''),
        slug: item.slug || '',
        name: item.title || '',
        image: item.thumbnail || '',
        price,
        originalPrice: normalizedOriginal,
        discountPercent,
        isBestPrice: Boolean(item.isBestPrice),
        isOnlineExclusive: Boolean(item.isOnlineExclusive),
        buttonText: 'Mua',
        // sold: typeof item.sold === 'number' ? item.sold : toNumberOrNull(item.sold) || 0,
        // isNew: Boolean(item.isNew),
        brand: item.brand || (Array.isArray(item.tags) ? item.tags[0] : null) || null
      }
    })



    return {
      category: {
        id: category._id?.toString?.() || String(category._id || ''),
        slug: category.slug,
        title: category.title,
        thumbnail: category.thumbnail || '',
        parent_id: category.parent_id || null
      },
      products,
      priceStats: {
        minPrice: priceStats?.minPrice ?? 0,
        maxPrice: priceStats?.maxPrice ?? 0
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    }
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
  bulkUpdateStatusAdmin,
  bulkDeleteAdmin,
  getListClient,
  getDetailClient,
  getProductsClient
}
