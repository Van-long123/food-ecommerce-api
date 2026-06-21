import Joi from "joi";
import { ObjectId } from "mongodb";
import { GET_DB } from "~/config/mongodb";

const ORDER_COLLECTION_NAME = "orders";

const ORDER_COLLECTION_SCHEMA = Joi.object({
  userId: Joi.string().required().trim().strict(),
  userInfo: Joi.object({
    fullname: Joi.string().required(),
    phone: Joi.string().required(),
    address: Joi.string().required(),
    ward: Joi.string().required(),
    district: Joi.string().required(),
    province: Joi.string().required(),
    note: Joi.string().allow("").optional(),
  }).required(),
  orderCode: Joi.number().integer().optional(),
  voucherCode: Joi.string().allow("", null).optional(),
  discountVoucher: Joi.number().min(0).default(0),
  shippingFee: Joi.number().min(0).default(0),
  totalPrice: Joi.number().min(0).required(),
  status: Joi.string()
    .valid(
      "pending",
      "confirmed",
      "processing",
      "shipping",
      "delivered",
      "cancelled",
      "returned",
    )
    .default("pending"),
  deliveredAt: Joi.date().timestamp("javascript").allow(null).default(null),
  createdAt: Joi.date().default(() => new Date()),
  updatedAt: Joi.date().default(null),
  updatedBy: Joi.array()
    .items(
      Joi.object({
        account_id: Joi.string(),
        updatedAt: Joi.date(),
      }),
    )
    .default([]),
});

const validateBeforeCreate = async (data) => {
  return ORDER_COLLECTION_SCHEMA.validateAsync(data, { abortEarly: false });
};

const createNew = async (data, options = {}) => {
  try {
    const validData = await validateBeforeCreate(data);

    // Convert to ObjectId before saving
    const persistData = {
      ...validData,
      userId: new ObjectId(validData.userId),
      deliveredAt: validData.deliveredAt
        ? new Date(validData.deliveredAt)
        : null,
      createdAt: new Date(validData.createdAt),
      updatedAt: validData.updatedAt ? new Date(validData.updatedAt) : null,
    };

    return await GET_DB()
      .collection(ORDER_COLLECTION_NAME)
      .insertOne(persistData, options);
  } catch (error) {
    throw new Error(error);
  }
};

const findByUserId = async (userId) => {
  try {
    return await GET_DB()
      .collection(ORDER_COLLECTION_NAME)
      .aggregate([
        { $match: { userId: new ObjectId(userId) } },
        { $sort: { createdAt: -1 } },
        {
          $lookup: {
            from: "order_items",
            localField: "_id",
            foreignField: "orderId",
            as: "items",
          },
        },
        {
          $lookup: {
            from: "payments",
            localField: "_id",
            foreignField: "orderId",
            as: "payment",
          },
        },
      ])
      .toArray();
  } catch (error) {
    throw new Error(error);
  }
};

const findByIdAndUserId = async (orderId, userId) => {
  try {
    const result = await GET_DB()
      .collection(ORDER_COLLECTION_NAME)
      .aggregate([
        {
          $match: { _id: new ObjectId(orderId), userId: new ObjectId(userId) },
        },
        {
          // Join order_items và enrich mỗi item với slug từ products collection
          $lookup: {
            from: "order_items",
            let: { orderId: "$_id" },
            pipeline: [
              { $match: { $expr: { $eq: ["$orderId", "$$orderId"] } } },
              {
                // Nested lookup: lấy slug từ products theo productId của mỗi item
                $lookup: {
                  from: "products",
                  let: { pid: "$productId" },
                  pipeline: [
                    { $match: { $expr: { $eq: ["$_id", "$$pid"] } } },
                    { $project: { slug: 1 } },
                  ],
                  as: "productInfo",
                },
              },
              {
                // Merge slug vào item, ưu tiên slug đã lưu sẵn, fallback lấy từ product
                $addFields: {
                  slug: {
                    $cond: {
                      if: { $and: [{ $ifNull: ["$slug", false] }, { $gt: [{ $strLenCP: { $ifNull: ["$slug", ""] } }, 0] }] },
                      then: "$slug",
                      else: { $arrayElemAt: ["$productInfo.slug", 0] },
                    },
                  },
                },
              },
              { $project: { productInfo: 0 } },
            ],
            as: "items",
          },
        },
        {
          $lookup: {
            from: "payments",
            localField: "_id",
            foreignField: "orderId",
            as: "payment",
          },
        },
      ])
      .toArray();

    return result[0] || null;
  } catch (error) {
    throw new Error(error);
  }
};

const updateStatus = async (orderId, userId, status, options = {}) => {
  try {
    return await GET_DB()
      .collection(ORDER_COLLECTION_NAME)
      .findOneAndUpdate(
        { _id: new ObjectId(orderId), userId: new ObjectId(userId) },
        { $set: { status, updatedAt: new Date() } },
        { returnDocument: "after", ...options },
      );
  } catch (error) {
    throw new Error(error);
  }
};

const listDeliveredOrderIdsByProduct = async (userId, productId) => {
  try {
    if (!ObjectId.isValid(userId) || !ObjectId.isValid(productId)) return [];

    const result = await GET_DB()
      .collection(ORDER_COLLECTION_NAME)
      .aggregate([
        {
          $match: {
            userId: new ObjectId(userId),
            status: "delivered",
          },
        },
        {
          $lookup: {
            from: "order_items",
            let: { orderId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$orderId", "$$orderId"] },
                      { $eq: ["$productId", new ObjectId(productId)] },
                    ],
                  },
                },
              },
              { $limit: 1 },
            ],
            as: "matchedItems",
          },
        },
        { $match: { "matchedItems.0": { $exists: true } } },
        { $sort: { createdAt: -1 } },
        { $project: { _id: 1 } },
      ])
      .toArray();

    return result.map((item) => item._id.toString());
  } catch (error) {
    throw new Error(error);
  }
};

const findByOrderCode = async (orderCode) => {
  try {
    return await GET_DB()
      .collection(ORDER_COLLECTION_NAME)
      .findOne({ orderCode: Number(orderCode) });
  } catch (error) {
    throw new Error(error);
  }
};

/**
 * Chatbot: Lấy các đơn hàng đang hoạt động (chưa hoàn thành) của user.
 * Chỉ lấy đúng các trường cần thiết để tối ưu băng thông + thời gian.
 */
const findActiveByUserId = async (userId) => {
  try {
    const ACTIVE_STATUSES = ['pending', 'confirmed', 'processing', 'shipping'];
    return await GET_DB()
      .collection(ORDER_COLLECTION_NAME)
      .aggregate([
        {
          $match: {
            userId: new ObjectId(userId),
            status: { $in: ACTIVE_STATUSES },
          },
        },
        { $sort: { createdAt: -1 } },
        {
          $lookup: {
            from: 'order_items',
            localField: '_id',
            foreignField: 'orderId',
            as: 'items',
            pipeline: [
              { $project: { title: 1, quantity: 1, price: 1, thumbnail: 1 } },
            ],
          },
        },
        {
          $lookup: {
            from: 'payments',
            localField: '_id',
            foreignField: 'orderId',
            as: 'payment',
            pipeline: [
              { $project: { paymentMethod: 1, status: 1, amount: 1 } },
            ],
          },
        },
        {
          $addFields: { payment: { $arrayElemAt: ['$payment', 0] } },
        },
        {
          $project: {
            orderCode: 1,
            status: 1,
            totalPrice: 1,
            shippingFee: 1,
            discountVoucher: 1,
            voucherCode: 1,
            createdAt: 1,
            userInfo: 1,
            items: 1,
            payment: 1,
          },
        },
      ])
      .toArray();
  } catch (error) {
    throw new Error(error);
  }
};

/**
 * Chatbot: Lấy chi tiết một đơn hàng đã giao/hoàn thành gần nhất của user.
 */
const findRecentByUserId = async (userId, limit = 5) => {
  try {
    return await GET_DB()
      .collection(ORDER_COLLECTION_NAME)
      .aggregate([
        { $match: { userId: new ObjectId(userId) } },
        { $sort: { createdAt: -1 } },
        { $limit: limit },
        {
          $lookup: {
            from: 'payments',
            localField: '_id',
            foreignField: 'orderId',
            as: 'payment',
            pipeline: [{ $project: { paymentMethod: 1, status: 1 } }],
          },
        },
        { $addFields: { payment: { $arrayElemAt: ['$payment', 0] } } },
        {
          $project: {
            orderCode: 1, status: 1, totalPrice: 1,
            createdAt: 1, payment: 1,
          },
        },
      ])
      .toArray();
  } catch (error) {
    throw new Error(error);
  }
};
//  tìm ra danh sách các đơn hàng thanh toán qua PayOS đã quá hạn (mặc định là quá 30 phút) nhưng vẫn chưa hoàn tất thanh toán.
const findPendingPayOSOrdersOlderThan = async (olderThanMinutes = 30) => {
  try {
    const cutoffDate = new Date(Date.now() - olderThanMinutes * 60 * 1000);

    return await GET_DB()
      .collection(ORDER_COLLECTION_NAME)
      .aggregate([
        {
          $match: {
            status: "pending",
            createdAt: { $lte: cutoffDate },
          },
        },
        {
          $lookup: {
            from: "order_items",
            localField: "_id",
            foreignField: "orderId",
            as: "items",
          },
        },
        {
          $lookup: {
            from: "payments",
            localField: "_id",
            foreignField: "orderId",
            as: "payment",
          },
        },
        {
          $match: {
            "payment.0.paymentMethod": "PayOS",
            "payment.0.status": "pending",
          },
        },
      ])
      .toArray();
  } catch (error) {
    throw new Error(error);
  }
};

const updateStatusById = async (orderId, status, options = {}) => {
  try {
    return await GET_DB()
      .collection(ORDER_COLLECTION_NAME)
      .findOneAndUpdate(
        { _id: new ObjectId(orderId) },
        { $set: { status, updatedAt: new Date() } },
        { returnDocument: "after", ...options },
      );
  } catch (error) {
    throw new Error(error);
  }
};

/**
 * Cập nhật trạng thái đơn hàng kèm mốc deliveredAt (dùng khi xác nhận đã nhận hàng). */
const updateStatusWithDeliveredAt = async (
  orderId,
  userId,
  status,
  options = {},
) => {
  try {
    const { expectedCurrentStatus, ...mongoOptions } = options;
    const filter = { _id: new ObjectId(orderId) };
    if (userId) filter.userId = new ObjectId(userId);
    if (expectedCurrentStatus) filter.status = expectedCurrentStatus;

    return await GET_DB()
      .collection(ORDER_COLLECTION_NAME)
      .findOneAndUpdate(
        filter,
        { $set: { status, deliveredAt: new Date(), updatedAt: new Date() } },
        { returnDocument: "after", ...mongoOptions },
      );
  } catch (error) {
    throw new Error(error);
  }
};

/**
 * Tìm các đơn hàng có trạng thái 'shipping' đã quá thời hạn cho việc tự động hoàn thành.
 * olderThanDays - Số ngày (tính từ updatedAt) */
const findShippingOrdersOlderThan = async (olderThanDays = 3) => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    return await GET_DB()
      .collection(ORDER_COLLECTION_NAME)
      .aggregate([
        {
          $match: {
            status: "shipping",
            updatedAt: { $lte: cutoffDate },
          },
        },
        {
          $lookup: {
            from: "order_items",
            localField: "_id",
            foreignField: "orderId",
            as: "items",
          },
        },
        {
          $lookup: {
            from: "payments",
            localField: "_id",
            foreignField: "orderId",
            as: "payment",
          },
        },
      ])
      .toArray();
  } catch (error) {
    throw new Error(error);
  }
};

const getAdminOrders = async (
  { query = {}, sort = { createdAt: -1 }, skip = 0, limit = 10 } = {},
  options = {},
) => {
  try {
    return await GET_DB()
      .collection(ORDER_COLLECTION_NAME)
      .aggregate(
        [
          { $match: query },
          { $sort: sort },
          { $skip: skip },
          { $limit: Number(limit) },
          {
            $lookup: {
              from: "payments",
              localField: "_id",
              foreignField: "orderId",
              as: "payment",
            },
          },
          {
            $lookup: {
              from: "order_items",
              localField: "_id",
              foreignField: "orderId",
              as: "items",
            },
          },
          {
            $addFields: {
              payment: { $arrayElemAt: ["$payment", 0] },
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

const countAdminOrders = async (query = {}, options = {}) => {
  try {
    return await GET_DB()
      .collection(ORDER_COLLECTION_NAME)
      .countDocuments(query, options);
  } catch (error) {
    throw new Error(error);
  }
};

const getAdminOrderDetail = async (orderId, options = {}) => {
  try {
    const aggregatePipeline = [
      { $match: { _id: new ObjectId(orderId) } },
      {
        $lookup: {
          from: "order_items",
          localField: "_id",
          foreignField: "orderId",
          as: "items",
        },
      },
      {
        $lookup: {
          from: "payments",
          localField: "_id",
          foreignField: "orderId",
          as: "payment",
        },
      },
      {
        $addFields: {
          payment: { $arrayElemAt: ["$payment", 0] },
        },
      },
    ];

    const { session, ...mongoOptions } = options;
    const collection = GET_DB().collection(ORDER_COLLECTION_NAME);
    const result = session
      ? await collection
          .aggregate(aggregatePipeline, { session, ...mongoOptions })
          .toArray()
      : await collection.aggregate(aggregatePipeline, mongoOptions).toArray();

    return result[0] || null;
  } catch (error) {
    throw new Error(error);
  }
};

const updateAdminStatus = async (orderId, status, adminId, options = {}) => {
  try {
    const now = new Date();
    const update = { status, updatedAt: now };
    if (status === "delivered") update.deliveredAt = now;

    return await GET_DB()
      .collection(ORDER_COLLECTION_NAME)
      .findOneAndUpdate(
        { _id: new ObjectId(orderId) },
        {
          $set: update,
          $push: {
            updatedBy: { account_id: new ObjectId(adminId), updatedAt: now },
          },
        },
        { returnDocument: "after", ...options },
      );
  } catch (error) {
    throw new Error(error);
  }
};

export const orderModel = {
  ORDER_COLLECTION_NAME,
  createNew,
  findByUserId,
  findByIdAndUserId,
  updateStatus,
  updateStatusById,
  updateStatusWithDeliveredAt,
  findShippingOrdersOlderThan,
  findByOrderCode,
  findPendingPayOSOrdersOlderThan,
  listDeliveredOrderIdsByProduct,
  getAdminOrders,
  countAdminOrders,
  getAdminOrderDetail,
  updateAdminStatus,
  findActiveByUserId,
  findRecentByUserId,
};
