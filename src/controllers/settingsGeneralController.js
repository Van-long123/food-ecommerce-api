import { StatusCodes } from 'http-status-codes'
import { settingsGeneralService } from '~/services/settingsGeneralService'

const getSettings = async (req, res, next) => {
  try {
    const result = await settingsGeneralService.getSettings()
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

const updateSettings = async (req, res, next) => {
  try {
    const result = await settingsGeneralService.updateSettings(req.body, req.file)
    res.status(StatusCodes.OK).json(result)
  } catch (error) { next(error) }
}

export const settingsGeneralController = {
  getSettings,
  updateSettings
}
