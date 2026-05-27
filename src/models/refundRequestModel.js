import Joi from "joi";
import { ObjectId } from "mongodb";
import { GET_DB } from "~/config/mongodb";

const REFUND_REQUEST_COLLECTION_NAME = "refund_requests";

const REFUND_REQUEST_STATUSES = {
  PENDING: "pending",
  APPROVED_WAITING_PICKUP: "approved_waiting_pickup",
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
  images: Joi.array().items(Joi.string()).default([]),
  videos: Joi.array().items(Joi.string()).default([]),
  refundMethod: Joi.string()
    .valid("bank_transfer", "cash_on_pickup")
    .default("bank_transfer"),
  bankInfo: Joi.when("refundMethod", {
    is: "cash_on_pickup",
    then: Joi.object({
      bankName: Joi.string(),
      accountNumber: Joi.string(),
      accountHolder: Joi.string(),
    })
      .allow(null)
      .default(null),
    otherwise: Joi.object({
      bankName: Joi.string().required(),
      accountNumber: Joi.string().required(),
      accountHolder: Joi.string().required(),
    })
      .allow(null)
      .default(null),
  }),
  status: Joi.string()
    .valid(
      REFUND_REQUEST_STATUSES.PENDING,
      REFUND_REQUEST_STATUSES.APPROVED_WAITING_PICKUP,
      REFUND_REQUEST_STATUSES.PROCESSING_REFUND,
      REFUND_REQUEST_STATUSES.COMPLETED,
      REFUND_REQUEST_STATUSES.REJECTED,
    )
    .default(REFUND_REQUEST_STATUSES.PENDING),
  amount: Joi.number().min(0).required(),
  rejectReason: Joi.string().allow("").default(""),
  transactionImage: Joi.string().allow("").default(""),
  createdAt: Joi.date().default(() => new Date()),
  updatedAt: Joi.date().default(null),
});

const buildAdminLookupStages = () => [
  {
    $lookup: {
      from: "orders",
      localField: "orderId",
      foreignField: "_id",
      as: "order",
    },
  },
  {
    $addFields: {
      order: { $arrayElemAt: ["$order", 0] },
    },
  },
  {
    $lookup: {
      from: "users",
      localField: "userId",
      foreignField: "_id",
      as: "user",
    },
  },
  {
    $addFields: {
      user: { $arrayElemAt: ["$user", 0] },
    },
  },
];

const buildAdminDetailLookupStages = () => [
  ...buildAdminLookupStages(),
  {
    $lookup: {
      from: "order_items",
      localField: "orderId",
      foreignField: "orderId",
      as: "orderItems",
    },
  },
];

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
      items: validData.items.map((item) => ({
        ...item,
        productId: new ObjectId(item.productId),
      })),
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

const getAdminRefundRequests = async (
  { match = {}, keywordQuery = null, sort = { createdAt: -1 }, skip = 0, limit = 10 } = {},
  options = {},
) => {
  try {
    const pipeline = [
      { $match: match },
      ...buildAdminLookupStages(),
      ...(keywordQuery ? [{ $match: keywordQuery }] : []),
      { $sort: sort },
      { $skip: skip },
      { $limit: Number(limit) },
    ];

    return await GET_DB()
      .collection(REFUND_REQUEST_COLLECTION_NAME)
      .aggregate(pipeline, options)
      .toArray();
  } catch (error) {
    throw new Error(error);
  }
};

const countAdminRefundRequests = async (
  { match = {}, keywordQuery = null } = {},
  options = {},
) => {
  try {
    const pipeline = [
      { $match: match },
      ...buildAdminLookupStages(),
      ...(keywordQuery ? [{ $match: keywordQuery }] : []),
      { $count: "total" },
    ];

    const result = await GET_DB()
      .collection(REFUND_REQUEST_COLLECTION_NAME)
      .aggregate(pipeline, options)
      .toArray();

    return result[0]?.total || 0;
  } catch (error) {
    throw new Error(error);
  }
};

const getAdminRefundRequestDetail = async (id, options = {}) => {
  try {
    const pipeline = [
      { $match: { _id: new ObjectId(id) } },
      ...buildAdminDetailLookupStages(),
    ];

    const { session, ...mongoOptions } = options;
    const collection = GET_DB().collection(REFUND_REQUEST_COLLECTION_NAME);
    const result = session
      ? await collection.aggregate(pipeline, { session, ...mongoOptions }).toArray()
      : await collection.aggregate(pipeline, mongoOptions).toArray();

    return result[0] || null;
  } catch (error) {
    throw new Error(error);
  }
};

const getAdminRefundSummary = async (match = {}, options = {}) => {
  try {
    return await GET_DB()
      .collection(REFUND_REQUEST_COLLECTION_NAME)
      .aggregate(
        [
          { $match: match },
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
              totalAmount: {
                $sum: {
                  $cond: [{ $eq: ["$status", "completed"] }, "$amount", 0],
                },
              },
            },
          },
        ],
        options,
      )
      .toArray();
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
  getAdminRefundRequests,
  countAdminRefundRequests,
  getAdminRefundRequestDetail,
  getAdminRefundSummary,
};
