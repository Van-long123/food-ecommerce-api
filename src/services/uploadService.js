import { StatusCodes } from 'http-status-codes'
import ApiError from '~/utils/ApiError'
import { CloudinaryProvider } from '~/providers/CloudinaryProvider'

const MAX_REVIEW_IMAGES = 3

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

const uploadReviewImages = async (files) => {
  if (!files || !Array.isArray(files) || files.length === 0) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Không có file nào được tải lên!')
  }

  if (files.length > MAX_REVIEW_IMAGES) {
    throw new ApiError(
      StatusCodes.UNPROCESSABLE_ENTITY,
      `Chỉ được upload tối đa ${MAX_REVIEW_IMAGES} ảnh cho mỗi đánh giá!`
    )
  }

  const uploadPromises = files.map((file) =>
    CloudinaryProvider.streamUpload(file.buffer, 'smartfood-reviews', file.mimetype)
  )

  const results = await Promise.all(uploadPromises)
  return { urls: results.map((r) => r.secure_url) }
}

export const uploadService = { uploadEditorImage, uploadReviewImages }
