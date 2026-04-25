import { StatusCodes } from 'http-status-codes'
import { articleService } from '~/services/articleService'

// ─── ADMIN ─────────────────────────────────────────────────────────────────────

const createNew = async (req, res, next) => {
  try {
    const result = await articleService.createNew(req.body, req.jwtDecoded._id)
    res.status(StatusCodes.CREATED).json(result)
  } catch (error) { next(error) }
}

const getListAdmin = async (req, res, next) => {
  try {
    const result = await articleService.getListAdmin(req.query)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

const getDetailAdmin = async (req, res, next) => {
  try {
    const result = await articleService.getDetailAdmin(req.params.id)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

const update = async (req, res, next) => {
  try {
    const result = await articleService.update(req.params.id, req.body, req.jwtDecoded._id)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

const softDelete = async (req, res, next) => {
  try {
    const result = await articleService.softDelete(req.params.id, req.jwtDecoded._id)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

// POST   /admin/articles/:id/categories        — gán vào category
const addCategory = async (req, res, next) => {
  try {
    const result = await articleService.addCategory(req.params.id, req.body)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

// DELETE /admin/articles/:id/categories/:catId — xóa khỏi category
const removeCategory = async (req, res, next) => {
  try {
    const result = await articleService.removeCategory(req.params.id, req.params.catId)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

// ─── CLIENT ────────────────────────────────────────────────────────────────────

const getListClient = async (req, res, next) => {
  try {
    const result = await articleService.getListClient(req.query)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

const getDetailClient = async (req, res, next) => {
  try {
    const result = await articleService.getDetailClient(req.params.slug)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

export const articleController = {
  createNew,
  getListAdmin,
  getDetailAdmin,
  update,
  softDelete,
  addCategory,
  removeCategory,
  getListClient,
  getDetailClient
}
