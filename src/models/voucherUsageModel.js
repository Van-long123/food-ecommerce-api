import Joi from 'joi'
import { GET_DB } from '~/config/mongodb'
import { voucherModel } from './voucherModel'
import { ObjectId } from 'mongodb'
import { StatusCodes } from 'http-status-codes'
import ApiError from '~/utils/ApiError'

const VOUCHER_USAGE_COLLECTION_NAME = 'voucher_usages'

const VOUCHER_USAGE_SCHEMA = Joi.object({
  voucherId: Joi.string().required(),
  userId: Joi.string().required(),
  orderId: Joi.string().allow(null).default(null),
  usedAt: Joi.date().default(() => new Date())
})

/**
 * Lấy số lần đã dùng voucher của 1 user cụ thể */
const countUsageByUser = async (voucherId, userId) => {
  try {
    return await GET_DB().collection(VOUCHER_USAGE_COLLECTION_NAME).countDocuments({
      voucherId: new ObjectId(voucherId),
      userId: new ObjectId(userId)
    })
  } catch (error) {
    throw error
  }
}

/**
 * Lấy số lần sử dụng của một user cho danh sách các voucher (Bulk query chống N+1).
 * Trả về object mapping: { [voucherId]: count }
 */
const countUsagesByUser = async (userId, voucherIds) => {
  try {
    const usages = await GET_DB()
      .collection(VOUCHER_USAGE_COLLECTION_NAME)
      .aggregate([
        {
          $match: {
            userId: new ObjectId(userId),
            voucherId: { $in: voucherIds.map((id) => new ObjectId(id)) },
          },
        },
        {
          $group: {
            _id: "$voucherId",
            count: { $sum: 1 },
          },
        },
      ])
      .toArray();

    return usages.reduce((acc, curr) => {
      acc[curr._id.toString()] = curr.count;
      return acc;
    }, {});
  } catch (error) {
    throw error;
  }
}

/**
 * Ghi lại usage khi user dùng voucher */
const recordUsage = async ({ voucherId, userId, orderId = null }, options = {}) => {
  try {
    const { session, maxUsage } = options
    const usage = await VOUCHER_USAGE_SCHEMA.validateAsync({
      voucherId: String(voucherId),
      userId: String(userId),
      orderId
    })

    const voucherFilter = { _id: new ObjectId(voucherId) }
    if (Number.isFinite(maxUsage)) {
      voucherFilter.usedCount = { $lt: maxUsage }
    }

    const updateResult = await GET_DB().collection(voucherModel.VOUCHER_COLLECTION_NAME).updateOne(
      voucherFilter,
      { $inc: { usedCount: 1 } },
      { session }
    )

    if (Number.isFinite(maxUsage) && updateResult.modifiedCount === 0) {
      throw new ApiError(StatusCodes.CONFLICT, 'Mã giảm giá đã hết lượt sử dụng!')
    }

    // Convert to ObjectId and Date before saving
    const persistUsage = {
      ...usage,
      voucherId: new ObjectId(usage.voucherId),
      userId: new ObjectId(usage.userId),
      orderId: usage.orderId ? new ObjectId(usage.orderId) : null,
      usedAt: new Date(usage.usedAt)
    }

    await GET_DB().collection(VOUCHER_USAGE_COLLECTION_NAME).insertOne(persistUsage, { session })
  } catch (error) {
    throw new Error(error)
  }
}

const deleteUsageByOrderId = async (orderId, options = {}) => {
  try {
    const { session } = options
    return await GET_DB().collection(VOUCHER_USAGE_COLLECTION_NAME).deleteOne(
      { orderId: new ObjectId(orderId) },
      { session }
    )
  } catch (error) {
    throw new Error(error)
  }
}

export const voucherUsageModel = {
  VOUCHER_USAGE_COLLECTION_NAME,
  countUsageByUser,
  countUsagesByUser,
  recordUsage,
  deleteUsageByOrderId
}
