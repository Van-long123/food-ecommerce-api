import { StatusCodes } from 'http-status-codes'
import { articleModel } from '~/models/articleModel'
import { categoryArticleModel } from '~/models/categoryArticleModel'
import { categoryModel } from '~/models/categoryModel'
import { userModel } from '~/models/userModel'
import ApiError from '~/utils/ApiError'
import { slugify } from '~/utils/formatters'

// ─── Helper: generate unique slug ─────────────────────────────────────────────
const generateUniqueSlug = async (title, providedSlug) => {
  const baseSlug = providedSlug ? slugify(providedSlug) : slugify(title)
  const existing = await articleModel.findOneBySlugAny(baseSlug)
  return existing ? `${baseSlug}-${Date.now()}` : baseSlug
}

/**
 * Đồng bộ categories cho article:
 * - Upsert từng category_id vào category_articles
 * - Xác định isPrimary theo primary_category_id
 */
const syncCategories = async (articleId, categoryIds = [], primaryCategoryId = null) => {
  for (const catId of categoryIds) {
    const cat = await categoryModel.findOneById(catId)
    if (!cat || cat.deleted) {
      throw new ApiError(StatusCodes.NOT_FOUND, `Không tìm thấy category với id: ${catId}`)
    }
    if (cat.type !== categoryModel.CATEGORY_TYPES.ARTICLE) {
      throw new ApiError(
        StatusCodes.UNPROCESSABLE_ENTITY,
        `Category "${cat.title}" có type="${cat.type}", chỉ cho phép category type="article"!`
      )
    }
  }

  const promises = categoryIds.map((catId, index) =>
    categoryArticleModel.upsert({
      article_id: articleId,
      category_id: catId,
      sortOrder: index,
      isPrimary: catId === primaryCategoryId
    })
  )
  await Promise.all(promises)
}

// ─── ADMIN: Create ────────────────────────────────────────────────────────────
const createNew = async (reqBody, actorId) => {
  try {
    const slug = await generateUniqueSlug(reqBody.title, reqBody.slug)

    const actor = await userModel.findOneById(actorId)
    if (!actor) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy tài khoản người thực hiện!')

    const newArticle = {
      title: reqBody.title,
      slug,
      shortDescription: reqBody.shortDescription || '',
      content: reqBody.content || '',
      thumbnail: reqBody.thumbnail || '',
      authorName: reqBody.authorName || '',
      readTime: reqBody.readTime ?? 0,
      publishedAt: reqBody.publishedAt ? new Date(reqBody.publishedAt) : null,
      status: reqBody.status || 'draft',
      featured: reqBody.featured ?? false,
      position: reqBody.position ?? 0,
      primary_category_id: reqBody.primary_category_id || null,
      tags: reqBody.tags || [],
      comments: Array.isArray(reqBody.comments) ? reqBody.comments : [],
      createdBy: { account_id: actorId, email: actor.email }
    }

    const created = await articleModel.createNew(newArticle)
    const articleId = created.insertedId.toString()

    const categoryIds = reqBody.category_ids || []
    const primaryId = reqBody.primary_category_id || categoryIds[0] || null
    if (categoryIds.length > 0) {
      await syncCategories(articleId, categoryIds, primaryId)
    }

    return await articleModel.getDetails(articleId)
  } catch (error) {
    throw error
  }
}

// ─── ADMIN: Get list ──────────────────────────────────────────────────────────
const getListAdmin = async (query) => {
  try {
    const page = parseInt(query.page) || 1
    const limit = parseInt(query.limit) || 10
    const sortField = query.sortField || 'publishedAt'
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1

    const queryConditions = [{ deleted: false }]
    if (query.status) queryConditions.push({ status: query.status })
    if (query.featured !== undefined) queryConditions.push({ featured: query.featured === 'true' })
    if (query.primary_category_id) queryConditions.push({ primary_category_id: query.primary_category_id })
    if (query.keyword) {
      queryConditions.push({
        $or: [
          { title: { $regex: new RegExp(query.keyword, 'i') } },
          { shortDescription: { $regex: new RegExp(query.keyword, 'i') } },
          { tags: { $elemMatch: { $regex: new RegExp(query.keyword, 'i') } } }
        ]
      })
    }

    const { data, total, stats } = await articleModel.getList({ queryConditions, page, limit, sort: { [sortField]: sortOrder } })
    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      stats
    }
  } catch (error) {
    throw error
  }
}

// ─── ADMIN: Get detail by ID ──────────────────────────────────────────────────
const getDetailAdmin = async (id) => {
  try {
    const article = await articleModel.getDetails(id)
    if (!article) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy bài viết!')
    return article
  } catch (error) {
    throw error
  }
}

// ─── ADMIN: Update ────────────────────────────────────────────────────────────
const update = async (id, reqBody, actorId) => {
  try {
    const article = await articleModel.findOneById(id)
    if (!article || article.deleted) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy bài viết!')

    const actor = await userModel.findOneById(actorId)
    if (!actor) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy tài khoản người thực hiện!')

    const updateData = { ...reqBody, updatedAt: new Date() }
    delete updateData.createdBy
    delete updateData.createdAt
    delete updateData.category_ids

    if (reqBody.title && !reqBody.slug) {
      updateData.slug = await generateUniqueSlug(reqBody.title, null)
    } else if (reqBody.slug) {
      const slugCandidate = slugify(reqBody.slug)
      const existing = await articleModel.findOneBySlugAny(slugCandidate)
      updateData.slug = (existing && existing._id.toString() !== id)
        ? `${slugCandidate}-${Date.now()}`
        : slugCandidate
    }

    if (reqBody.publishedAt) updateData.publishedAt = new Date(reqBody.publishedAt)

    await articleModel.pushUpdatedBy(id, actorId, actor.email)
    await articleModel.update(id, updateData)

    if (Array.isArray(reqBody.category_ids)) {
      const primaryId = reqBody.primary_category_id || reqBody.category_ids[0] || null
      await syncCategories(id, reqBody.category_ids, primaryId)
    }

    return await articleModel.getDetails(id)
  } catch (error) {
    throw error
  }
}

// ─── ADMIN: Thêm article vào một category ─────────────────────────────────────
const addCategory = async (articleId, reqBody) => {
  try {
    const article = await articleModel.findOneById(articleId)
    if (!article || article.deleted) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy bài viết!')

    const category = await categoryModel.findOneById(reqBody.category_id)
    if (!category || category.deleted) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy category!')
    if (category.type !== categoryModel.CATEGORY_TYPES.ARTICLE) {
      throw new ApiError(
        StatusCodes.UNPROCESSABLE_ENTITY,
        `Category này có type="${category.type}", chỉ cho phép category type="article"!`
      )
    }

    await categoryArticleModel.upsert({
      article_id: articleId,
      category_id: reqBody.category_id,
      sortOrder: reqBody.sortOrder ?? 0,
      isPrimary: reqBody.isPrimary ?? false
    })

    if (reqBody.isPrimary) {
      await articleModel.update(articleId, { primary_category_id: reqBody.category_id, updatedAt: new Date() })
    }

    return await articleModel.getDetails(articleId)
  } catch (error) {
    throw error
  }
}

// ─── ADMIN: Xóa article khỏi một category ─────────────────────────────────────
const removeCategory = async (articleId, categoryId) => {
  try {
    const article = await articleModel.findOneById(articleId)
    if (!article || article.deleted) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy bài viết!')

    await categoryArticleModel.removeOne({ article_id: articleId, category_id: categoryId })

    if (article.primary_category_id === categoryId) {
      await articleModel.update(articleId, { primary_category_id: null, updatedAt: new Date() })
    }

    return await articleModel.getDetails(articleId)
  } catch (error) {
    throw error
  }
}

// ─── ADMIN: Soft Delete ───────────────────────────────────────────────────────
const softDelete = async (id, actorId) => {
  try {
    const article = await articleModel.findOneById(id)
    if (!article || article.deleted) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy bài viết!')

    const actor = await userModel.findOneById(actorId)
    if (!actor) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy tài khoản người thực hiện!')

    await categoryArticleModel.deleteAllByArticleId(id)
    return await articleModel.softDelete(id, actorId, actor.email)
  } catch (error) {
    throw error
  }
}

// ─── CLIENT: Get list ─────────────────────────────────────────────────────────
const getListClient = async (query) => {
  try {
    const page = parseInt(query.page) || 1
    const limit = parseInt(query.limit) || 10
    const sortField = query.sortField || 'publishedAt'
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1

    const queryConditions = [{ deleted: false }, { status: 'active' }]
    if (query.featured !== undefined) queryConditions.push({ featured: query.featured === 'true' })
    
    const categoryId = query.category_id || query.primary_category_id || null

    if (query.keyword) {
      queryConditions.push({
        $or: [
          { title: { $regex: new RegExp(query.keyword, 'i') } },
          { shortDescription: { $regex: new RegExp(query.keyword, 'i') } },
          { tags: { $elemMatch: { $regex: new RegExp(query.keyword, 'i') } } }
        ]
      })
    }

    const { data, total, stats } = await articleModel.getList({ queryConditions, categoryId, page, limit, sort: { [sortField]: sortOrder } })
    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      stats
    }
  } catch (error) {
    throw error
  }
}

// ─── CLIENT: Get detail by slug ───────────────────────────────────────────────
const getDetailClient = async (slug) => {
  try {
    const article = await articleModel.getDetails(slug, true)
    if (!article) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy bài viết!')
    articleModel.incrementViews(article._id).catch(() => {})
    return article
  } catch (error) {
    throw error
  }
}

const createCommentClient = async (slug, reqBody, userId) => {
  try {
    const user = await userModel.findOneById(userId)
    if (!user) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy người dùng!')

    const content = String(reqBody.content || '').trim()
    if (!content) {
      throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Nội dung bình luận không được để trống!')
    }

    const { article, comment } = await articleModel.addCommentBySlug(slug, {
      name: user.displayName || user.username || 'Khách hàng',
      avatar: user.avatar || '',
      content,
      createdAt: new Date()
    })

    if (!article) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy bài viết!')

    return {
      message: 'Gửi bình luận thành công!',
      comment: {
        _id: comment._id,
        name: comment.name,
        avatar: comment.avatar,
        content: comment.content,
        createdAt: comment.createdAt
      }
    }
  } catch (error) {
    throw error
  }
}

export const articleService = {
  createNew,
  getListAdmin,
  getDetailAdmin,
  update,
  addCategory,
  removeCategory,
  softDelete,
  getListClient,
  getDetailClient,
  createCommentClient
}
