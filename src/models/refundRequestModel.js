import Joi from "joi";
import { ObjectId } from "mongodb";
import { GET_DB } from "~/config/mongodb";

const REFUND_REQUEST_COLLECTION_NAME = "refund_requests";

const REFUND_REQUEST_STATUSES = {
  PENDING: "pending",
  APPROVED_WAITING_BANK_INFO: "approved_waiting_bank_info",
  PROCESSING_REFUND: "processing_refund",
  COMPLETED: "completed",
  REJECTED: "rejected",
};

const REFUND_REQUEST_SCHEMA = Joi.object({
  orderId: Joi.string().required().trim().strict(),
  userId: Joi.string().required().trim().strict(),
  items: Joi.array()
    .items(
      Joi.object({
        productId: Joi.string().required().trim().strict(),
        quantity: Joi.number().integer().min(1).required(),
        price: Joi.number().min(0).required(),
      }),
    )
    .min(1)
    .required(),
  reason: Joi.string().required().trim(),
  images: Joi.array().items(Joi.string()).min(1).required(),
  videos: Joi.array().items(Joi.string()).default([]),
  bankInfo: Joi.object({
    bankName: Joi.string().required(),
    accountNumber: Joi.string().required(),
    accountHolder: Joi.string().required(),
  })
    .allow(null)
    .default(null),
  status: Joi.string()
    .valid(
      REFUND_REQUEST_STATUSES.PENDING,
      REFUND_REQUEST_STATUSES.APPROVED_WAITING_BANK_INFO,
      REFUND_REQUEST_STATUSES.PROCESSING_REFUND,
      REFUND_REQUEST_STATUSES.COMPLETED,
      REFUND_REQUEST_STATUSES.REJECTED,
    )
    .default(REFUND_REQUEST_STATUSES.PENDING),
  amount: Joi.number().min(0).required(),
  rejectReason: Joi.string().allow("").default(""),
  createdAt: Joi.date().timestamp("javascript").default(Date.now),
  updatedAt: Joi.date().timestamp("javascript").default(null),
});

const validateBeforeCreate = async (data) => {
  return REFUND_REQUEST_SCHEMA.validateAsync(data, { abortEarly: false });
};

const createNew = async (data, options = {}) => {
  try {
    const validData = await validateBeforeCreate(data);
    const persistData = {
      ...validData,
      orderId: new ObjectId(validData.orderId),
      userId: new ObjectId(validData.userId),
      createdAt: new Date(validData.createdAt),
      updatedAt: validData.updatedAt ? new Date(validData.updatedAt) : null,
    };

    return await GET_DB()
      .collection(REFUND_REQUEST_COLLECTION_NAME)
      .insertOne(persistData, options);
  } catch (error) {
    throw new Error(error);
  }
};

const findById = async (id) => {
  try {
    return await GET_DB()
      .collection(REFUND_REQUEST_COLLECTION_NAME)
      .findOne({ _id: new ObjectId(id) });
  } catch (error) {
    throw new Error(error);
  }
};

const findByIdAndUserId = async (id, userId) => {
  try {
    return await GET_DB()
      .collection(REFUND_REQUEST_COLLECTION_NAME)
      .findOne({ _id: new ObjectId(id), userId: new ObjectId(userId) });
  } catch (error) {
    throw new Error(error);
  }
};

const findLatestByOrderIdAndUserId = async (orderId, userId) => {
  try {
    return await GET_DB()
      .collection(REFUND_REQUEST_COLLECTION_NAME)
      .find({ orderId: new ObjectId(orderId), userId: new ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray()
      .then((items) => items[0] || null);
  } catch (error) {
    throw new Error(error);
  }
};

const updateById = async (id, updateData, options = {}) => {
  try {
    const persistUpdateData = {
      ...updateData,
      updatedAt: new Date(),
    };

    return await GET_DB()
      .collection(REFUND_REQUEST_COLLECTION_NAME)
      .findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: persistUpdateData },
        { returnDocument: "after", ...options },
      );
  } catch (error) {
    throw new Error(error);
  }
};

export const refundRequestModel = {
  REFUND_REQUEST_COLLECTION_NAME,
  REFUND_REQUEST_STATUSES,
  REFUND_REQUEST_SCHEMA,
  createNew,
  findById,
  findByIdAndUserId,
  findLatestByOrderIdAndUserId,
  updateById,
};
