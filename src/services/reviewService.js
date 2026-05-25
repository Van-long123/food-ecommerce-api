import { StatusCodes } from 'http-status-codes'
import { reviewModel } from '~/models/reviewModel'
import { productModel } from '~/models/productModel'
import ApiError from '~/utils/ApiError'

const buildRatingStats = (stats = []) => {
  const map = new Map(stats.map((item) => [Number(item._id), item.count]))
  return [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: map.get(star) || 0
  }))
}

const normalizeReview = (review) => {
  if (!review) return null
  return {
    id: review._id?.toString() || review.id,
    productId: review.productId?.toString() || review.productId,
    userId: review.userId?.toString() || review.userId,
    productName: review.productName || '',
    customerName: review.customerName || '',
    rating: review.rating,
    comment: review.comment || '',
    images: Array.isArray(review.images) ? review.images : [],
    status: review.status,
    rejectReason: review.rejectReason || null,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt
  }
}

const getListAdmin = async (query) => {
  try {
    const page = parseInt(query.page) || 1
    const limit = parseInt(query.limit) || 10
    const sortField = query.sortField || 'createdAt'
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1
    const rating = query.rating ? Number(query.rating) : null
    const status = query.status || null
    const keyword = query.keyword || null

    const { data, total, stats } = await reviewModel.getAdminList({
      page,
      limit,
      sort: { [sortField]: sortOrder },
      status,
      rating,
      keyword
    })

    return {
      data: data.map(normalizeReview),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      },
      stats: buildRatingStats(stats)
    }
  } catch (error) {
    throw error
  }
}

const getDetailAdmin = async (id) => {
  try {
    const review = await reviewModel.getDetailAdmin(id)
    if (!review) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy đánh giá!')
    return normalizeReview(review)
  } catch (error) {
    throw error
  }
}

const updateStatusAdmin = async (id, status) => {
  try {
    if (!Object.values(reviewModel.REVIEW_STATUSES).includes(status)) {
      throw new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, 'Trạng thái đánh giá không hợp lệ!')
    }

    const existingReview = await reviewModel.findOneById(id)
    if (!existingReview) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy đánh giá!')

    const updated = await reviewModel.updateReview(id, { status })
    await productModel.syncRatingsFromReviews(existingReview.productId.toString())

    return normalizeReview(updated?.value || updated)
  } catch (error) {
    throw error
  }
}

export const reviewService = {
  getListAdmin,
  getDetailAdmin,
  updateStatusAdmin
}
