import { StatusCodes } from 'http-status-codes'
import multer from 'multer'
import ApiError from '~/utils/ApiError'
import { ALLOW_FILE_TYPES, LIMIT_FILE_SIZE } from '~/utils/validators'

//  Function kiểm tra loại file nào được chấp nhận
const customFileFilter = (req, file, callback) => {
  if (!ALLOW_FILE_TYPES.includes(file.mimetype)) {
    const errMessage = 'Kiểu file không hợp lệ. Chỉ chấp nhận jpg, jpeg, png, mp4, mov, webm'
    return callback(new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, errMessage), null)
  }

  return callback(null, true)
}

// Khởi tao function upload file bằng multer
const upload = multer({
  // kiểm tra giới hạn của file
  limits: { fileSize: LIMIT_FILE_SIZE },
  fileFilter: customFileFilter
})

export const multerUploadMiddleware = { upload }
