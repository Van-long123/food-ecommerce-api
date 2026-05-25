import Joi from "joi";
import { ObjectId } from "mongodb";
import { GET_DB } from "~/config/mongodb";
import { EMAIL_RULE, EMAIL_RULE_MESSAGE } from "~/utils/validators";

const CATEGORY_TYPES = {
  PRODUCT: "product",
  ARTICLE: "article",
};

const CATEGORY_STATUSES = {
  ACTIVE: "active",
  INACTIVE: "inactive",
};

const CATEGORY_COLLECTION_NAME = "categories";

const CATEGORY_COLLECTION_SCHEMA = Joi.object({
  title: Joi.string().required().trim().strict(),
  slug: Joi.string().required().trim().strict(),
  type: Joi.string()
    .valid(...Object.values(CATEGORY_TYPES))
    .required(),
  description: Joi.string().allow("").default(""),
  thumbnail: Joi.string().allow("").default(""),
  bannerImage: Joi.string().allow("").default(""),
  badgeText: Joi.string().allow("").default(""),
  status: Joi.string()
    .valid(...Object.values(CATEGORY_STATUSES))
    .default(CATEGORY_STATUSES.ACTIVE),
  featured: Joi.boolean().default(false),
  position: Joi.number().integer().default(0),
  parent_id: Joi.alternatives()
    .try(Joi.string(), Joi.allow(null))
    .default(null),
  deleted: Joi.boolean().default(false),
  createdBy: Joi.object({
    account_id: Joi.string(),
    email: Joi.string()
      .required()
      .pattern(EMAIL_RULE)
      .message(EMAIL_RULE_MESSAGE),
  }).required(),
  deletedBy: Joi.object({
    account_id: Joi.string(),
    email: Joi.string()
      .required()
      .pattern(EMAIL_RULE)
      .message(EMAIL_RULE_MESSAGE),
  })
    .allow(null)
    .default(null),
  updatedBy: Joi.array()
    .items(
      Joi.object({
        account_id: Joi.string(),
        email: Joi.string()
          .required()
          .pattern(EMAIL_RULE)
          .message(EMAIL_RULE_MESSAGE),
      }),
    )
    .default([]),
  createdAt: Joi.date().default(() => new Date()),
  deletedAt: Joi.date().default(null),
  updatedAt: Joi.date().default(null),
});

const INVALID_UPDATE_FIELDS = ["_id", "createdBy", "createdAt", "deletedAt"];

const toObjectIdOrNull = (value) => {
  if (!value || value === "null") return null;
  return new ObjectId(value);
};

const toObjectIdArray = (ids = []) =>
  ids
    .map((id) => {
      try {
        return new ObjectId(id);
      } catch (error) {
        return null;
      }
    })
    .filter(Boolean);

const validateBeforeCreate = async (data) => {
  return await CATEGORY_COLLECTION_SCHEMA.validateAsync(data, {
    abortEarly: false,
  });
};

const createNew = async (data) => {
  try {
    const validData = await validateBeforeCreate(data);
    const persistData = {
      ...validData,
      parent_id: toObjectIdOrNull(validData.parent_id),
    };
    const result = await GET_DB()
      .collection(CATEGORY_COLLECTION_NAME)
      .insertOne(persistData);
    return result;
  } catch (error) {
    throw new Error(error);
  }
};

const findOneById = async (id) => {
  try {
    return await GET_DB()
      .collection(CATEGORY_COLLECTION_NAME)
      .findOne({ _id: new ObjectId(id) });
  } catch (error) {
    throw new Error(error);
  }
};

const findOneBySlug = async (slug) => {
  try {
    return await GET_DB()
      .collection(CATEGORY_COLLECTION_NAME)
      .findOne({ slug, deleted: false });
  } catch (error) {
    throw new Error(error);
  }
};

const findOneBySlugAny = async (slug) => {
  try {
    return await GET_DB()
      .collection(CATEGORY_COLLECTION_NAME)
      .findOne({ slug });
  } catch (error) {
    throw new Error(error);
  }
};

/**
 * Lấy danh sách categories kèm thông tin parent (nếu có) bằng $lookup.
 * Dùng $facet để lấy data và count trong một truy vấn duy nhất — giống boardModel.getBoards().
 */
const getList = async ({
  queryConditions = [],
  page = 1,
  limit = 10,
  sort = { position: 1 },
}) => {
  try {
    const query = await GET_DB()
      .collection(CATEGORY_COLLECTION_NAME)
      .aggregate([
        { $match: { $and: queryConditions } },
        // JOIN với chính collection categories để lấy thông tin parent
        {
          $lookup: {
            from: CATEGORY_COLLECTION_NAME,
            localField: "parent_id",
            foreignField: "_id",
            as: "parent",
            pipeline: [
              { $match: { deleted: false } },
              { $project: { _id: 1, title: 1, slug: 1, type: 1 } },
            ],
          },
        },
        // Chuyển parent từ array thành object hoặc null
        {
          $addFields: {
            parent: { $arrayElemAt: ["$parent", 0] },
          },
        },
        { $sort: sort },
        {
          $facet: {
            // Nhánh 1: lấy data có phân trang
            queryData: [{ $skip: (page - 1) * limit }, { $limit: limit }],
            // Nhánh 2: đếm tổng số bản ghi
            queryTotal: [{ $count: "count" }],
          },
        },
      ])
      .toArray();

    const res = query[0];
    return {
      data: res.queryData || [],
      total: res.queryTotal[0]?.count || 0,
    };
  } catch (error) {
    throw new Error(error);
  }
};

/**
 * Lấy toàn bộ categories không phân trang (dùng cho menu, home page)
 */
const getAll = async (filter = {}) => {
  try {
    return await GET_DB()
      .collection(CATEGORY_COLLECTION_NAME)
      .find(filter)
      .sort({ position: 1 })
      .toArray();
  } catch (error) {
    throw new Error(error);
  }
};

/**
 * [OPTIMIZED — Home Page]
 * Giống getAll() nhưng với LEAN PROJECTION — chỉ lấy fields cần thiết cho menu.
 * Loại bỏ audit trail (createdBy, updatedBy, deletedBy) và các heavy fields.
 */
const getAllForMenu = async (filter = {}) => {
  try {
    return await GET_DB()
      .collection(CATEGORY_COLLECTION_NAME)
      .find(filter)
      .sort({ position: 1 })
      .project({
        _id: 1,
        title: 1,
        slug: 1,
        type: 1,
        thumbnail: 1,
        bannerImage: 1,
        badgeText: 1,
        parent_id: 1,
        featured: 1,
        position: 1,
      })
      .toArray();
  } catch (error) {
    throw new Error(error);
  }
};

const update = async (id, updateData) => {
  try {
    Object.keys(updateData).forEach((field) => {
      if (INVALID_UPDATE_FIELDS.includes(field)) delete updateData[field];
    });
    const persistUpdateData = {
      ...updateData,
      updatedAt: new Date(),
    };
    if (Object.prototype.hasOwnProperty.call(persistUpdateData, "parent_id")) {
      persistUpdateData.parent_id = toObjectIdOrNull(persistUpdateData.parent_id);
    }

    const result = await GET_DB()
      .collection(CATEGORY_COLLECTION_NAME)
      .findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: persistUpdateData },
        { returnDocument: "after" },
      );
    return result;
  } catch (error) {
    throw new Error(error);
  }
};

const pushUpdatedBy = async (id, actorId, actorEmail) => {
  try {
    await GET_DB()
      .collection(CATEGORY_COLLECTION_NAME)
      .updateOne(
        { _id: new ObjectId(id) },
        {
          $push: { updatedBy: { account_id: new ObjectId(actorId), email: actorEmail } },
          $set: { updatedAt: new Date() },
        },
      );
  } catch (error) {
    throw new Error(error);
  }
};

const softDelete = async (id, actorId, actorEmail) => {
  try {
    const result = await GET_DB()
      .collection(CATEGORY_COLLECTION_NAME)
      .findOneAndUpdate(
        { _id: new ObjectId(id) },
        {
          $set: {
            deleted: true,
            deletedAt: new Date(),
            deletedBy: { account_id: new ObjectId(actorId), email: actorEmail },
          },
        },
        { returnDocument: "after" },
      );
    return result;
  } catch (error) {
    throw new Error(error);
  }
};

const bulkUpdateStatus = async (ids = [], status) => {
  try {
    const objectIds = toObjectIdArray(ids);
    if (!objectIds.length) {
      return { modifiedCount: 0 };
    }

    const result = await GET_DB()
      .collection(CATEGORY_COLLECTION_NAME)
      .updateMany(
        { _id: { $in: objectIds }, deleted: false },
        {
          $set: {
            status,
            updatedAt: new Date(),
          },
        },
      );

    return { modifiedCount: result.modifiedCount || 0 };
  } catch (error) {
    throw new Error(error);
  }
};

const bulkSoftDelete = async (ids = [], actorId, actorEmail) => {
  try {
    const objectIds = toObjectIdArray(ids);
    if (!objectIds.length) {
      return { modifiedCount: 0 };
    }

    const result = await GET_DB()
      .collection(CATEGORY_COLLECTION_NAME)
      .updateMany(
        { _id: { $in: objectIds }, deleted: false },
        {
          $set: {
            deleted: true,
            deletedAt: new Date(),
            deletedBy: { account_id: new ObjectId(actorId), email: actorEmail },
            updatedAt: new Date(),
          },
        },
      );

    return { modifiedCount: result.modifiedCount || 0 };
  } catch (error) {
    throw new Error(error);
  }
};

const getMaxPosition = async () => {
  try {
    const result = await GET_DB()
      .collection(CATEGORY_COLLECTION_NAME)
      .find({ deleted: false })
      .sort({ position: -1 })
      .limit(1)
      .project({ position: 1 })
      .toArray();
    return result[0]?.position ?? 0;
  } catch (error) {
    throw new Error(error);
  }
};

export const categoryModel = {
  CATEGORY_TYPES,
  CATEGORY_STATUSES,
  CATEGORY_COLLECTION_NAME,
  createNew,
  findOneById,
  findOneBySlug,
  findOneBySlugAny,
  getList,
  getAll,
  getAllForMenu,
  update,
  pushUpdatedBy,
  softDelete,
  bulkUpdateStatus,
  bulkSoftDelete,
  getMaxPosition,
};
