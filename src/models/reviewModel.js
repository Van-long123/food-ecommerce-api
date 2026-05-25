import Joi from "joi";
import { ObjectId } from "mongodb";
import { GET_DB } from "~/config/mongodb";

const REVIEW_STATUSES = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
};

const REVIEW_COLLECTION_NAME = "reviews";

const REVIEW_COLLECTION_SCHEMA = Joi.object({
  productId: Joi.string().required().trim().strict(),
  userId: Joi.string().required().trim().strict(),
  rating: Joi.number().integer().min(1).max(5).required(),
  comment: Joi.string().allow("").default(""),
  images: Joi.array().items(Joi.string()).default([]),
  orderIds: Joi.array().items(Joi.string()).default([]),
  status: Joi.string()
    .valid(...Object.values(REVIEW_STATUSES))
    .default(REVIEW_STATUSES.PENDING),
  rejectReason: Joi.string().allow(null, "").default(null),
  createdAt: Joi.date().default(() => new Date()),
  updatedAt: Joi.date().allow(null).default(null),
  // thêm update chỉ được 1 review / product nếu đánh giá lại → update, không phải tạo mới
});

const validateBeforeCreate = async (data) => {
  return REVIEW_COLLECTION_SCHEMA.validateAsync(data, { abortEarly: false });
};

const createNew = async (data) => {
  try {
    const validData = await validateBeforeCreate(data);
    const orderIds = Array.isArray(validData.orderIds)
      ? validData.orderIds
          .filter((id) => ObjectId.isValid(id))
          .map((id) => new ObjectId(id))
      : [];
    const persistData = {
      ...validData,
      productId: new ObjectId(validData.productId),
      userId: new ObjectId(validData.userId),
      orderIds,
    };
    const created = await GET_DB()
      .collection(REVIEW_COLLECTION_NAME)
      .insertOne(persistData);
    return created;
  } catch (error) {
    throw new Error(error);
  }
};

const findOneByUserAndProduct = async (productId, userId) => {
  try {
    if (!ObjectId.isValid(productId) || !ObjectId.isValid(userId)) return null;

    return await GET_DB()
      .collection(REVIEW_COLLECTION_NAME)
      .findOne(
        {
          productId: new ObjectId(productId),
          userId: new ObjectId(userId),
        },
        {
          sort: { updatedAt: -1, createdAt: -1 },
        },
      );
  } catch (error) {
    throw new Error(error);
  }
};

const updateReview = async (reviewId, updateData, orderIdToAdd = null) => {
  try {
    if (!ObjectId.isValid(reviewId)) return null;

    const updateDoc = {
      $set: {
        ...updateData,
        updatedAt: new Date(),
      },
    };

    if (orderIdToAdd && ObjectId.isValid(orderIdToAdd)) {
      updateDoc.$addToSet = { orderIds: new ObjectId(orderIdToAdd) };
    }

    return await GET_DB()
      .collection(REVIEW_COLLECTION_NAME)
      .findOneAndUpdate({ _id: new ObjectId(reviewId) }, updateDoc, {
        returnDocument: "after",
      });
  } catch (error) {
    throw new Error(error);
  }
};

const findOneById = async (reviewId) => {
  try {
    if (!ObjectId.isValid(reviewId)) return null;
    return await GET_DB()
      .collection(REVIEW_COLLECTION_NAME)
      .findOne({ _id: new ObjectId(reviewId) });
  } catch (error) {
    throw new Error(error);
  }
};

const getAdminList = async ({
  page = 1,
  limit = 10,
  sort = { createdAt: -1 },
  status = null,
  rating = null,
  keyword = null,
}) => {
  try {
    // Lọc theo trạng thái (status)
    const baseMatch = [];
    if (status) baseMatch.push({ status });

    const baseMatchStage = baseMatch.length
      ? { $match: { $and: baseMatch } }
      : { $match: {} };
    //Lọc theo số sao đánh giá (rating)
    const ratingMatchStage = rating
      ? { $match: { rating: Number(rating) } }
      : null;
    //Lọc theo từ khóa (keyword)
    const keywordRegex = keyword ? new RegExp(keyword, "i") : null;

    const keywordMatchStage = keywordRegex
      ? {
          $match: {
            $or: [
              { comment: { $regex: keywordRegex } },
              { "product.title": { $regex: keywordRegex } },
              { "user.displayName": { $regex: keywordRegex } },
            ],
          },
        }
      : null;

    const query = await GET_DB()
      .collection(REVIEW_COLLECTION_NAME)
      .aggregate([
        baseMatchStage,
        {
          $lookup: {
            from: "products",
            localField: "productId",
            foreignField: "_id",
            pipeline: [{ $project: { _id: 1, title: 1 } }],
            as: "product",
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            pipeline: [{ $project: { _id: 1, displayName: 1 } }],
            as: "user",
          },
        },
        {
          $addFields: {
            product: { $arrayElemAt: ["$product", 0] },
            user: { $arrayElemAt: ["$user", 0] },
          },
        },
        // phải nằm sau bước $lookup vì nó cần tìm kiếm dựa trên product.title và user.displayName đã được join vào.
        ...(keywordMatchStage ? [keywordMatchStage] : []),
        {
          //  $facet cho phép chạy nhiều pipeline song song trên cùng một tập dữ liệu
          $facet: {
            //  Luồng chính để lấy danh sách hiển thị.
            queryData: [
              ...(ratingMatchStage ? [ratingMatchStage] : []),
              { $sort: sort },
              { $skip: (page - 1) * limit },
              { $limit: limit },
              {
                $project: {
                  productId: 1,
                  userId: 1,
                  rating: 1,
                  comment: 1,
                  images: 1,
                  status: 1,
                  rejectReason: 1,
                  createdAt: 1,
                  updatedAt: 1,
                  productName: "$product.title",
                  customerName: "$user.displayName",
                },
              },
            ],
            queryTotal: [
              ...(ratingMatchStage ? [ratingMatchStage] : []),
              { $count: "count" },
            ],
            //  Luồng này dùng $group để gom nhóm các rating giống nhau và tính tổng
            ratingStats: [
              {
                $group: {
                  _id: "$rating",
                  count: { $sum: 1 },
                },
              },
            ],
          },
        },
      ])
      .toArray();

    const res = query[0] || {};
    return {
      data: res.queryData || [],
      total: res.queryTotal?.[0]?.count || 0,
      stats: res.ratingStats || [],
    };
  } catch (error) {
    throw new Error(error);
  }
};

const getDetailAdmin = async (reviewId) => {
  try {
    if (!ObjectId.isValid(reviewId)) return null;

    const result = await GET_DB()
      .collection(REVIEW_COLLECTION_NAME)
      .aggregate([
        { $match: { _id: new ObjectId(reviewId) } },
        {
          $lookup: {
            from: "products",
            localField: "productId",
            foreignField: "_id",
            pipeline: [{ $project: { _id: 1, title: 1 } }],
            as: "product",
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            pipeline: [{ $project: { _id: 1, displayName: 1 } }],
            as: "user",
          },
        },
        {
          $addFields: {
            product: { $arrayElemAt: ["$product", 0] },
            user: { $arrayElemAt: ["$user", 0] },
          },
        },
        {
          $project: {
            productId: 1,
            userId: 1,
            rating: 1,
            comment: 1,
            images: 1,
            status: 1,
            rejectReason: 1,
            createdAt: 1,
            updatedAt: 1,
            productName: "$product.title",
            customerName: "$user.displayName",
          },
        },
      ])
      .toArray();

    return result[0] || null;
  } catch (error) {
    throw new Error(error);
  }
};

export const reviewModel = {
  REVIEW_STATUSES,
  REVIEW_COLLECTION_NAME,
  createNew,
  findOneByUserAndProduct,
  updateReview,
  findOneById,
  getAdminList,
  getDetailAdmin,
};
