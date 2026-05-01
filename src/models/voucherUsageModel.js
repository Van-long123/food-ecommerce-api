import Joi from 'joi'
import { GET_DB } from '~/config/mongodb'
import { voucherModel } from './voucherModel'
import { ObjectId } from 'mongodb'

const VOUCHER_USAGE_COLLECTION_NAME = 'voucher_usages'

const VOUCHER_USAGE_SCHEMA = Joi.object({
  voucherId: Joi.string().required(),
  userId: Joi.string().required(),
  orderId: Joi.string().allow(null).default(null),
  usedAt: Joi.date().default(Date.now)
})

/**
 * Lấy số lần đã dùng voucher của 1 user cụ thể
 */
const countUsageByUser = async (voucherId, userId) => {
  try {
    return await GET_DB().collection(VOUCHER_USAGE_COLLECTION_NAME).countDocuments({
      voucherId: String(voucherId),
      userId: String(userId)
    })
  } catch (error) {
    throw new Error(error)
  }
}

/**
 * Ghi lại usage khi user dùng voucher
 */
const recordUsage = async ({ voucherId, userId, orderId = null }) => {
  try {
    const usage = await VOUCHER_USAGE_SCHEMA.validateAsync({
      voucherId: String(voucherId),
      userId: String(userId),
      orderId
    })

    await GET_DB().collection(VOUCHER_USAGE_COLLECTION_NAME).insertOne(usage)

    // Tăng usedCount bên Voucher
    await GET_DB().collection(voucherModel.VOUCHER_COLLECTION_NAME).updateOne(
      { _id: new ObjectId(voucherId) },
      { $inc: { usedCount: 1 } }
    )
  } catch (error) {
    throw new Error(error)
  }
}

export const voucherUsageModel = {
  VOUCHER_USAGE_COLLECTION_NAME,
  countUsageByUser,
  recordUsage
}
