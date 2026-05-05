import { StatusCodes } from 'http-status-codes'
import { voucherService } from '~/services/voucherService'

// ─── CLIENT ───────────────────────────────────────────────────────────────────

const getListClient = async (req, res, next) => {
  try {
    const result = await voucherService.getListClient(req.query)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

const validateVoucher = async (req, res, next) => {
  try {
    const accountId = req.jwtDecoded ? req.jwtDecoded._id : null
    const result = await voucherService.validateVoucher(req.body, accountId)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

// ─── ADMIN ────────────────────────────────────────────────────────────────────

const getListAdmin = async (req, res, next) => {
  try {
    const result = await voucherService.getListAdmin(req.query)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

const createNew = async (req, res, next) => {
  try {
    const result = await voucherService.createNew(req.body, req.jwtDecoded._id)
    res.status(StatusCodes.CREATED).json(result)
  } catch (error) { next(error) }
}

const updateVoucher = async (req, res, next) => {
  try {
    const result = await voucherService.updateVoucher(req.params.id, req.body)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

const deleteVoucher = async (req, res, next) => {
  try {
    const result = await voucherService.deleteVoucher(req.params.id)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

export const voucherController = {
  getListClient,
  validateVoucher,
  getListAdmin,
  createNew,
  updateVoucher,
  deleteVoucher
}
