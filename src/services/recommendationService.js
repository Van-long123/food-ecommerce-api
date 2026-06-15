import axios from 'axios'
import { StatusCodes } from 'http-status-codes'
import ApiError from '~/utils/ApiError'
import { env } from '~/config/environment'

const BASE_URL = env.RECOMMENDATION_SERVICE_URL || 'http://localhost:8000'

/**
 * Gọi Python microservice để lấy danh sách sản phẩm gợi ý theo product_id.
 *
 * Python trả về:
 * {
 *   success: true,
 *   product_id: "...",
 *   total: 8,
 *   recommendations: [
 *     { _id, title, slug, price, images, ratings, primary_category_id,
 *       featured, isBestPrice, isOnlineExclusive, similarity_score }
 *   ]
 * } */
const getRecommendations = async (productId, { limit = 8, categoryBoost = true } = {}) => {
  try {
    const response = await axios.get('/api/product-recommendation', {
      baseURL: BASE_URL,
      params: {
        product_id: productId,
        limit,
        category_boost: categoryBoost
      },
      timeout: 8000 // 8s timeout
    })
    
    return response.data
  } catch (err) {
    if (err.response) {
      if (err.response.status === 404) {
        throw new ApiError(StatusCodes.NOT_FOUND, `Không tìm thấy sản phẩm với id: ${productId}`)
      }
      throw new ApiError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        err.response.data?.detail || 'Lỗi khi lấy gợi ý sản phẩm.'
      )
    }
    // Network error hoặc timeout
    throw new ApiError(
      StatusCodes.SERVICE_UNAVAILABLE,
      'Recommendation service không khả dụng. Vui lòng thử lại sau.'
    )
  }
}

const refreshCache = async () => {
  // Fire and forget (không cần await strict response để không làm chậm luồng)
  axios.post('/cache-refresh', {}, {
    baseURL: BASE_URL
  }).catch(err => {
    console.error("Lỗi khi gọi webhook refresh-cache:", err.message)
  })
}

export const recommendationService = {
  getRecommendations,
  refreshCache
}
