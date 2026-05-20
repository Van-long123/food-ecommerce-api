import Joi from "joi";
import { ObjectId } from "mongodb";
import { GET_DB } from "~/config/mongodb";

const PAYMENT_COLLECTION_NAME = "payments";

const PAYMENT_COLLECTION_SCHEMA = Joi.object({
  orderId: Joi.string().required().trim().strict(),
  userId: Joi.string().required().trim().strict(),
  paymentMethod: Joi.string().valid("COD", "PayOS").required(),
  amount: Joi.number().min(0).required(),
  currency: Joi.string().default("VND"),
  status: Joi.string()
    .valid("pending", "completed", "cancelled")
    .default("pending"),

  // PayOS specific fields
  transactionId: Joi.string().allow("").optional(), // ID từ phía provider
  paymentUrl: Joi.string().allow("").optional(), // URL thanh toán (cho QR hoặc Redirect)
  rawResponse: Joi.object().optional(), // Lưu toàn bộ log từ provider trả về

  createdAt: Joi.date().default(() => new Date()),
  updatedAt: Joi.date().default(null),
});

const validateBeforeCreate = async (data) => {
  return PAYMENT_COLLECTION_SCHEMA.validateAsync(data, { abortEarly: false });
};

const createNew = async (data, options = {}) => {
  try {
    const validData = await validateBeforeCreate(data);

    // Convert to ObjectId and Date before saving
    const persistData = {
      ...validData,
      orderId: new ObjectId(validData.orderId),
      userId: new ObjectId(validData.userId),
      createdAt: new Date(validData.createdAt),
      updatedAt: validData.updatedAt ? new Date(validData.updatedAt) : null,
    };

    return await GET_DB()
      .collection(PAYMENT_COLLECTION_NAME)
      .insertOne(persistData, options);
  } catch (error) {
    throw new Error(error);
  }
};

const updateStatus = async (paymentId, status, rawResponse = null) => {
  try {
    const updateData = {
      status,
      updatedAt: new Date(),
    };
    if (rawResponse) updateData.rawResponse = rawResponse;

    return await GET_DB()
      .collection(PAYMENT_COLLECTION_NAME)
      .findOneAndUpdate(
        { _id: new ObjectId(paymentId) },
        { $set: updateData },
        { returnDocument: "after" },
      );
  } catch (error) {
    throw new Error(error);
  }
};

const updateStatusByOrderId = async (orderId, status, options = {}) => {
  try {
    return await GET_DB()
      .collection(PAYMENT_COLLECTION_NAME)
      .updateMany(
        { orderId: new ObjectId(orderId) },
        { $set: { status, updatedAt: new Date() } },
        options,
      );
  } catch (error) {
    throw new Error(error);
  }
};

const updatePayOSCompleted = async (
  orderId,
  transactionId,
  rawResponse,
  options = {},
) => {
  try {
    return await GET_DB()
      .collection(PAYMENT_COLLECTION_NAME)
      .findOneAndUpdate(
        { orderId: new ObjectId(orderId) },
        {
          $set: {
            status: "completed",
            transactionId: String(transactionId),
            rawResponse,
            updatedAt: new Date(),
          },
        },
        { returnDocument: "after", ...options },
      );
  } catch (error) {
    throw new Error(error);
  }
};

export const paymentModel = {
  PAYMENT_COLLECTION_NAME,
  createNew,
  updateStatus,
  updateStatusByOrderId,
  updatePayOSCompleted,
};
