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
  payosOrderId: Joi.string().allow("", null).optional(),
  transactionId: Joi.string().allow("").optional(), // ID từ phía provider
  paymentUrl: Joi.string().allow("").optional(), // URL thanh toán (cho QR hoặc Redirect)
  expiresAt: Joi.date().allow(null).optional(),
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

const updateByOrderId = async (orderId, updateData = {}, options = {}) => {
  try {
    return await GET_DB()
      .collection(PAYMENT_COLLECTION_NAME)
      .findOneAndUpdate(
        { orderId: new ObjectId(orderId) },
        { $set: { ...updateData, updatedAt: new Date() } },
        { returnDocument: "after", ...options },
      );
  } catch (error) {
    throw new Error(error);
  }
};

const findByOrderId = async (orderId, options = {}) => {
  try {
    const { session, ...mongoOptions } = options;
    const collection = GET_DB().collection(PAYMENT_COLLECTION_NAME);
    return session
      ? await collection.findOne(
          { orderId: new ObjectId(orderId) },
          { session, ...mongoOptions },
        )
      : await collection.findOne(
          { orderId: new ObjectId(orderId) },
          mongoOptions,
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

// Giả sử Service của bạn có một luồng thực thi chạy bên trong 1 Transaction tên là sessionA
// Bước 1: Sửa trạng thái Thanh toán thành completed (Đã lưu nháp trong sessionA, nhưng chưa được Commit vào Database gốc).
// Bước 2: Chạy hàm findById để lấy thông tin Thanh toán ra kiểm tra lại xem tổng tiền là bao nhiêu.
// Trường hợp KHÔNG truyền session vào findById: Hàm này sẽ chạy ra ngoài DB gốc để tìm. Lúc này nó sẽ thấy trạng thái Thanh toán vẫn là pending (dữ liệu cũ), vì cái kết quả completed ở bước 1 vẫn bị giam trong Transaction chứ chưa được Commit ra ngoài. => Gây lỗi sai Logic code trầm trọng.
// Trường hợp CÓ truyền session vào findById: MongoDB hiểu rằng hàm findById này thuộc về nhóm sessionA. Nó sẽ cho phép hàm này "nhìn thấy" dữ liệu nháp (trạng thái completed) vừa được sửa ở Bước 1.
const findById = async (paymentId, options = {}) => {
  try {
    const { session, ...mongoOptions } = options;
    const collection = GET_DB().collection(PAYMENT_COLLECTION_NAME);
    return session
      ? await collection.findOne(
          { _id: new ObjectId(paymentId) },
          { session, ...mongoOptions },
        )
      : await collection.findOne(
          { _id: new ObjectId(paymentId) },
          mongoOptions,
        );
  } catch (error) {
    throw new Error(error);
  }
};

const getAdminPayments = async (
  {
    query = {},
    keyword = "",
    sort = { createdAt: -1 },
    skip = 0,
    limit = 10,
  } = {},
  options = {},
) => {
  try {
    const pipeline = [
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
    ];

    if (keyword) {
      const kw = keyword.trim();
      const isNumber = /^\d+$/.test(kw);
      pipeline.push({
        $match: {
          $or: [
            { transactionId: { $regex: kw, $options: "i" } },
            { "order.userInfo.fullname": { $regex: kw, $options: "i" } },
            ...(isNumber ? [{ "order.orderCode": Number(kw) }] : []),
          ],
        },
      });
    }

    if (Object.keys(query).length) {
      pipeline.unshift({ $match: query });
    }

    const countPipeline = [...pipeline, { $count: "total" }];
    const dataPipeline = [
      ...pipeline,
      { $sort: sort },
      { $skip: skip },
      { $limit: Number(limit) },
    ];

    const collection = GET_DB().collection(PAYMENT_COLLECTION_NAME);
    const [data, countResult] = await Promise.all([
      collection.aggregate(dataPipeline, options).toArray(),
      collection.aggregate(countPipeline, options).toArray(),
    ]);

    const total = countResult[0]?.total ?? 0;
    return { data, total };
  } catch (error) {
    throw new Error(error);
  }
};

const getPaymentStats = async (options = {}) => {
  try {
    return await GET_DB()
      .collection(PAYMENT_COLLECTION_NAME)
      .aggregate(
        [
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
              totalAmount: { $sum: "$amount" },
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

export const paymentModel = {
  PAYMENT_COLLECTION_NAME,
  createNew,
  updateStatus,
  updateStatusByOrderId,
  updateByOrderId,
  findByOrderId,
  updatePayOSCompleted,
  findById,
  getAdminPayments,
  getPaymentStats,
};
