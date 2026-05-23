import { StatusCodes } from 'http-status-codes'
import { roleService } from '~/services/roleService'

const createNew = async (req, res, next) => {
  try {
    const result = await roleService.createNew(req.body)
    res.status(StatusCodes.CREATED).json(result)
  } catch (error) {
    next(error)
  }
}

const getListAdmin = async (req, res, next) => {
  try {
    const result = await roleService.getListAdmin(req.query)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

const getDetailAdmin = async (req, res, next) => {
  try {
    const result = await roleService.getDetailAdmin(req.params.id)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

const update = async (req, res, next) => {
  try {
    const result = await roleService.update(req.params.id, req.body)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

const softDelete = async (req, res, next) => {
  try {
    const result = await roleService.softDelete(req.params.id)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

const softDeleteMany = async (req, res, next) => {
  try {
    const result = await roleService.softDeleteMany(req.body.ids)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

export const roleController = {
  createNew,
  getListAdmin,
  getDetailAdmin,
  update,
  softDelete,
  softDeleteMany
}
