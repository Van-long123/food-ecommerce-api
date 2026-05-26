import { StatusCodes } from 'http-status-codes'
import ApiError from '~/utils/ApiError'
import { CloudinaryProvider } from '~/providers/CloudinaryProvider'

const uploadEditorImage = async (file) => {
  if (!file) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'File upload không hợp lệ!')
  }

  const uploadResult = await CloudinaryProvider.streamUpload(
    file.buffer,
    'smartfood-editor',
    file.mimetype
  )

  return { location: uploadResult.secure_url }
}

export const uploadService = { uploadEditorImage }
