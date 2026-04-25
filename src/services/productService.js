import { StatusCodes } from 'http-status-codes'
import { productModel } from '~/models/productModel'
import { categoryProductModel } from '~/models/categoryProductModel'
import { categoryModel } from '~/models/categoryModel'
import ApiError from '~/utils/ApiError'
import { slugify } from '~/utils/formatters'

// ─── Helper: generate unique slug ─────────────────────────────────────────────
const generateUniqueSlug = async (title, providedSlug) => {
  const baseSlug = providedSlug ? slugify(providedSlug) : slugify(title)
  const existing = await productModel.findOneBySlugAny(baseSlug)
  return existing ? `${baseSlug}-${Date.now()}` : baseSlug
}

/**
 * Đồng bộ categories cho product:
 * - Upsert từng category_id vào category_products
 * - Xác định isPrimary theo primary_category_id
 * @param {string} productId
 * @param {string[]} categoryIds — danh sách category_id
 * @param {string|null} primaryCategoryId
 */
const syncCategories = async (productId, categoryIds = [], primaryCategoryId = null) => {
  // Validate: tất cả category phải tồn tại và type=product
  for (const catId of categoryIds) {
    const cat = await categoryModel.findOneById(catId)
    if (!cat || cat.deleted) {
      throw new ApiError(StatusCodes.NOT_FOUND, `Không tìm thấy category với id: ${catId}`)
    }
    if (cat.type !== categoryModel.CATEGORY_TYPES.PRODUCT) {
      throw new ApiError(
        StatusCodes.UNPROCESSABLE_ENTITY,
        `Category "${cat.title}" có type="${cat.type}", chỉ cho phép category type="product"!`
      )
    }
  }

  // Upsert từng mapping
  const promises = categoryIds.map((catId, index) =>
    categoryProductModel.upsert({
      product_id: productId,
      category_id: catId,
      position: index,
      isPrimary: catId === primaryCategoryId
    })
  )
  await Promise.all(promises)
}

// ─── ADMIN: Create ────────────────────────────────────────────────────────────
const createNew = async (reqBody, actorId) => {
  try {
    const slug = await generateUniqueSlug(reqBody.title, reqBody.slug)

    const newProduct = {
      title: reqBody.title,
      slug,
      description: reqBody.description || '',
      thumbnail: reqBody.thumbnail || '',
      images: reqBody.images || [],
      stock: reqBody.stock ?? 0,
      unit: reqBody.unit || 'kg',
      price: reqBody.price,
      discountPercentage: reqBody.discountPercentage ?? 0,
      originalPrice: reqBody.originalPrice ?? reqBody.price,
      status: reqBody.status || 'active',
      featured: reqBody.featured ?? false,
      isBestPrice: reqBody.isBestPrice ?? false,
      isOnlineExclusive: reqBody.isOnlineExclusive ?? false,
      tags: reqBody.tags || [],
      ratings: reqBody.ratings || { totalRating: 0, numberOfRatings: 0 },
      position: reqBody.position ?? 0,
      primary_category_id: reqBody.primary_category_id || null,
      createdBy: { account_id: actorId, createdAt: new Date() }
    }

    const created = await productModel.createNew(newProduct)
    const productId = created.insertedId.toString()

    // Đồng bộ categories (nếu có truyền lên)
    const categoryIds = reqBody.category_ids || []
    const primaryId = reqBody.primary_category_id || categoryIds[0] || null
    if (categoryIds.length > 0) {
      await syncCategories(productId, categoryIds, primaryId)
    }

    const result = await productModel.getDetails(productId)
    return result
  } catch (error) {
    throw error
  }
}

// ─── ADMIN: Get list ──────────────────────────────────────────────────────────
const getListAdmin = async (query) => {
  try {
    const page = parseInt(query.page) || 1
    const limit = parseInt(query.limit) || 10
    const sortField = query.sortField || 'position'
    const sortOrder = query.sortOrder === 'desc' ? -1 : 1

    const queryConditions = [{ deleted: false }]
    if (query.status) queryConditions.push({ status: query.status })
    if (query.featured !== undefined) queryConditions.push({ featured: query.featured === 'true' })
    if (query.isBestPrice !== undefined) queryConditions.push({ isBestPrice: query.isBestPrice === 'true' })
    if (query.isOnlineExclusive !== undefined) queryConditions.push({ isOnlineExclusive: query.isOnlineExclusive === 'true' })
    if (query.keyword) {
      queryConditions.push({
        $or: [
          { title: { $regex: new RegExp(query.keyword, 'i') } },
          { tags: { $elemMatch: { $regex: new RegExp(query.keyword, 'i') } } }
        ]
      })
    }
    if (query.minPrice || query.maxPrice) {
      const priceFilter = {}
      if (query.minPrice) priceFilter.$gte = parseFloat(query.minPrice)
      if (query.maxPrice) priceFilter.$lte = parseFloat(query.maxPrice)
      queryConditions.push({ price: priceFilter })
    }
    if (query.primary_category_id) queryConditions.push({ primary_category_id: query.primary_category_id })

    const { data, total } = await productModel.getList({ queryConditions, page, limit, sort: { [sortField]: sortOrder } })
    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    }
  } catch (error) {
    throw error
  }
}

// ─── ADMIN: Get detail by ID (kèm categories từ aggregate) ───────────────────
const getDetailAdmin = async (id) => {
  try {
    const product = await productModel.getDetails(id)
    if (!product) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy sản phẩm!')
    return product
  } catch (error) {
    throw error
  }
}

// ─── ADMIN: Update (có thể cập nhật categories cùng lúc) ─────────────────────
const update = async (id, reqBody, actorId) => {
  try {
    const product = await productModel.findOneById(id)
    if (!product || product.deleted) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy sản phẩm!')

    const updateData = { ...reqBody, updatedAt: new Date() }
    delete updateData.createdBy
    delete updateData.createdAt
    delete updateData.category_ids // chỉ xử lý riêng bên dưới

    // Slug
    if (reqBody.title && !reqBody.slug) {
      updateData.slug = await generateUniqueSlug(reqBody.title, null)
    } else if (reqBody.slug) {
      const slugCandidate = slugify(reqBody.slug)
      const existing = await productModel.findOneBySlugAny(slugCandidate)
      updateData.slug = (existing && existing._id.toString() !== id)
        ? `${slugCandidate}-${Date.now()}`
        : slugCandidate
    }

    await productModel.pushUpdatedBy(id, actorId)
    await productModel.update(id, updateData)

    // Đồng bộ categories nếu có truyền category_ids
    if (Array.isArray(reqBody.category_ids)) {
      const primaryId = reqBody.primary_category_id || reqBody.category_ids[0] || null
      await syncCategories(id, reqBody.category_ids, primaryId)
    }

    const result = await productModel.getDetails(id)
    return result
  } catch (error) {
    throw error
  }
}

// ─── ADMIN: Thêm product vào một category ─────────────────────────────────────
const addCategory = async (productId, reqBody) => {
  try {
    const product = await productModel.findOneById(productId)
    if (!product || product.deleted) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy sản phẩm!')

    const category = await categoryModel.findOneById(reqBody.category_id)
    if (!category || category.deleted) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy category!')
    if (category.type !== categoryModel.CATEGORY_TYPES.PRODUCT) {
      throw new ApiError(
        StatusCodes.UNPROCESSABLE_ENTITY,
        `Category này có type="${category.type}", chỉ cho phép category type="product"!`
      )
    }

    await categoryProductModel.upsert({
      product_id: productId,
      category_id: reqBody.category_id,
      position: reqBody.position ?? 0,
      isPrimary: reqBody.isPrimary ?? false
    })

    // Nếu set làm primary → cập nhật primary_category_id trên product
    if (reqBody.isPrimary) {
      await productModel.update(productId, { primary_category_id: reqBody.category_id, updatedAt: new Date() })
    }

    return await productModel.getDetails(productId)
  } catch (error) {
    throw error
  }
}

// ─── ADMIN: Xóa product khỏi một category ─────────────────────────────────────
const removeCategory = async (productId, categoryId) => {
  try {
    const product = await productModel.findOneById(productId)
    if (!product || product.deleted) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy sản phẩm!')

    await categoryProductModel.removeOne({ product_id: productId, category_id: categoryId })

    // Nếu category bị xóa là primary → reset primary_category_id
    if (product.primary_category_id === categoryId) {
      await productModel.update(productId, { primary_category_id: null, updatedAt: new Date() })
    }

    return await productModel.getDetails(productId)
  } catch (error) {
    throw error
  }
}

// ─── ADMIN: Soft Delete ───────────────────────────────────────────────────────
const softDelete = async (id, actorId) => {
  try {
    const product = await productModel.findOneById(id)
    if (!product || product.deleted) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy sản phẩm!')
    // Xoá mềm tất cả category mappings
    await categoryProductModel.deleteAllByProductId(id)
    const result = await productModel.softDelete(id, actorId)
    return result
  } catch (error) {
    throw error
  }
}

// ─── CLIENT: Get list ─────────────────────────────────────────────────────────
const getListClient = async (query) => {
  try {
    const page = parseInt(query.page) || 1
    const limit = parseInt(query.limit) || 10
    const sortField = query.sortField || 'position'
    const sortOrder = query.sortOrder === 'desc' ? -1 : 1

    const queryConditions = [{ deleted: false }, { status: 'active' }]
    if (query.featured !== undefined) queryConditions.push({ featured: query.featured === 'true' })
    if (query.isBestPrice !== undefined) queryConditions.push({ isBestPrice: query.isBestPrice === 'true' })
    if (query.isOnlineExclusive !== undefined) queryConditions.push({ isOnlineExclusive: query.isOnlineExclusive === 'true' })
    if (query.keyword) {
      queryConditions.push({
        $or: [
          { title: { $regex: new RegExp(query.keyword, 'i') } },
          { tags: { $elemMatch: { $regex: new RegExp(query.keyword, 'i') } } }
        ]
      })
    }
    if (query.minPrice || query.maxPrice) {
      const priceFilter = {}
      if (query.minPrice) priceFilter.$gte = parseFloat(query.minPrice)
      if (query.maxPrice) priceFilter.$lte = parseFloat(query.maxPrice)
      queryConditions.push({ price: priceFilter })
    }
    if (query.primary_category_id) queryConditions.push({ primary_category_id: query.primary_category_id })

    const { data, total } = await productModel.getList({ queryConditions, page, limit, sort: { [sortField]: sortOrder } })
    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    }
  } catch (error) {
    throw error
  }
}

// ─── CLIENT: Get detail by slug ───────────────────────────────────────────────
const getDetailClient = async (slug) => {
  try {
    const product = await productModel.getDetails(slug, true)
    if (!product) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy sản phẩm!')
    return product
  } catch (error) {
    throw error
  }
}

export const productService = {
  createNew,
  getListAdmin,
  getDetailAdmin,
  update,
  addCategory,
  removeCategory,
  softDelete,
  getListClient,
  getDetailClient
}
