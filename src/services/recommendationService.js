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
 * }
 */
const getRecommendations = async (productId, { limit = 8, categoryBoost = true } = {}) => {
  const url = new URL('/api/product-recommendation', BASE_URL)
  url.searchParams.set('product_id', productId)
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('category_boost', String(categoryBoost))

  let response
  try {
    response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8000) // 8s timeout
    })
    console.log("🚀 ~ getRecommendations ~ response:", response)

  } catch (err) {
    // Network error hoặc timeout
    throw new ApiError(
      StatusCodes.SERVICE_UNAVAILABLE,
      'Recommendation service không khả dụng. Vui lòng thử lại sau.'
    )
  }

  if (response.status === 404) {
    throw new ApiError(StatusCodes.NOT_FOUND, `Không tìm thấy sản phẩm với id: ${productId}`)
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    throw new ApiError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      errorBody.detail || 'Lỗi khi lấy gợi ý sản phẩm.'
    )
  }

  const data = await response.json()
  return data
}

export const recommendationService = {
  getRecommendations
}
