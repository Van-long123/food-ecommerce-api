import { WHITELIST_ORIGIN } from '~/utils/constants'
import { env } from '~/config/environment'
import { StatusCodes } from 'http-status-codes'
import ApiError from '~/utils/ApiError'

// Cấu hình CORS Option
export const corsOptions = {
  origin: function (origin, callback) {
    if (env.BUILD_MODE === 'dev' || !origin) { // Cho phép khi không có Origin (redirect OAuth, Postman, curl)
      return callback(null, true)
    }

    // Kiểm tra xem origin có phải là origin được chấp nhận hay không
    if (WHITELIST_ORIGIN.includes(origin)) {
      return callback(null, true) //null có nghĩa là ko có lỗi, true là cho phép đi qua để truy cập tài nguyên
    }

    // Cuối cùng nếu origin không được chấp nhận thì trả về lỗi
    return callback(new ApiError(StatusCodes.FORBIDDEN, `${origin} không được phép truy cập theo chính sách CORS.`))
  },

  optionsSuccessStatus: 200,

  // CORS sẽ cho phép nhận cookies từ request,
  credentials: true
}
