import { StatusCodes } from 'http-status-codes'
import { productService } from '~/services/productService'
import { recommendationService } from '~/services/recommendationService'

// ─── ADMIN ─────────────────────────────────────────────────────────────────────

const createNew = async (req, res, next) => {
  try {
    const result = await productService.createNew(req.body, req.jwtDecoded._id, req.files)
    res.status(StatusCodes.CREATED).json(result)
  } catch (error) { next(error) }
}

const getListAdmin = async (req, res, next) => {
  try {
    const result = await productService.getListAdmin(req.query)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

const getDetailAdmin = async (req, res, next) => {
  try {
    const result = await productService.getDetailAdmin(req.params.id)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

const update = async (req, res, next) => {
  try {
    const result = await productService.update(req.params.id, req.body, req.jwtDecoded._id, req.files)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

const softDelete = async (req, res, next) => {
  try {
    const result = await productService.softDelete(req.params.id, req.jwtDecoded._id)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

const bulkUpdateStatusAdmin = async (req, res, next) => {
  try {
    const result = await productService.bulkUpdateStatusAdmin(req.body)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

const bulkDeleteAdmin = async (req, res, next) => {
  try {
    const result = await productService.bulkDeleteAdmin(req.body, req.jwtDecoded._id)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

// POST   /admin/products/:id/categories        — gán vào category
const addCategory = async (req, res, next) => {
  try {
    const result = await productService.addCategory(req.params.id, req.body)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

// DELETE /admin/products/:id/categories/:catId — xóa khỏi category
const removeCategory = async (req, res, next) => {
  try {
    const result = await productService.removeCategory(req.params.id, req.params.catId)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

// ─── CLIENT ────────────────────────────────────────────────────────────────────

const getListClient = async (req, res, next) => {
  try {
    const result = await productService.getListClient(req.query)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

const getDetailClient = async (req, res, next) => {
  try {
    const result = await productService.getDetailClient(req.params.slug)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

const createReviewClient = async (req, res, next) => {
  try {
    const result = await productService.createReviewClient(req.params.slug, req.body, req.jwtDecoded._id)
    res.status(StatusCodes.CREATED).json(result)
  } catch (error) { next(error) }
}

const getReviewEligibilityClient = async (req, res, next) => {
  try {
    const result = await productService.getReviewEligibilityClient(req.params.slug, req.jwtDecoded._id)
    res.status(StatusCodes.OK).json({ success: true, ...result })
  } catch (error) { next(error) }
}

const getRecommendations = async (req, res, next) => {
  try {
    const { id } = req.params
    const limit = Math.min(parseInt(req.query.limit) || 8, 20)
    const categoryBoost = req.query.category_boost !== 'false'
    const result = await recommendationService.getRecommendations(id, { limit, categoryBoost })
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

export const productController = {
  createNew,
  getListAdmin,
  getDetailAdmin,
  update,
  softDelete,
  bulkUpdateStatusAdmin,
  bulkDeleteAdmin,
  addCategory,
  removeCategory,
  getListClient,
  getDetailClient,
  createReviewClient,
  getReviewEligibilityClient,
  getRecommendations
}
