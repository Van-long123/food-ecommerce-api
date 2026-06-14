import { StatusCodes } from 'http-status-codes'
import { uploadService } from '~/services/uploadService'

const uploadEditorImage = async (req, res, next) => {
  try {
    const result = await uploadService.uploadEditorImage(req.file)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

const uploadReviewImages = async (req, res, next) => {
  try {
    const result = await uploadService.uploadReviewImages(req.files)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

export const uploadController = { uploadEditorImage, uploadReviewImages }
