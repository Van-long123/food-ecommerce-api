import { StatusCodes } from 'http-status-codes'
import { categoryService } from '~/services/categoryService'

// ─── ADMIN ─────────────────────────────────────────────────────────────────────

const createNew = async (req, res, next) => {
  try {
    const actorId = req.jwtDecoded._id
    const result = await categoryService.createNew(req.body, actorId)
    res.status(StatusCodes.CREATED).json(result)
  } catch (error) {
    next(error)
  }
}

const getListAdmin = async (req, res, next) => {
  try {
    const result = await categoryService.getListAdmin(req.query)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

const getDetailAdmin = async (req, res, next) => {
  try {
    const result = await categoryService.getDetailAdmin(req.params.id)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

const update = async (req, res, next) => {
  try {
    const actorId = req.jwtDecoded._id
    const result = await categoryService.update(req.params.id, req.body, actorId)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

const softDelete = async (req, res, next) => {
  try {
    const actorId = req.jwtDecoded._id
    const result = await categoryService.softDelete(req.params.id, actorId)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

// ─── CLIENT ────────────────────────────────────────────────────────────────────

const getListClient = async (req, res, next) => {
  try {
    const result = await categoryService.getListClient(req.query)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

const getDetailClient = async (req, res, next) => {
  try {
    const result = await categoryService.getDetailClient(req.params.slug)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

const getProductsClient = async (req, res, next) => {
  try {
    const result = await categoryService.getProductsClient(req.params.slug, req.query)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

export const categoryController = {
  createNew,
  getListAdmin,
  getDetailAdmin,
  update,
  softDelete,
  getListClient,
  getDetailClient,
  getProductsClient
}
