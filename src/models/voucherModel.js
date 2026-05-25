import Joi from "joi";
import { ObjectId } from "mongodb";
import { GET_DB } from "~/config/mongodb";
import { EMAIL_RULE, EMAIL_RULE_MESSAGE } from "~/utils/validators";

const VOUCHER_COLLECTION_NAME = "vouchers";

const VOUCHER_TYPES = {
  MONEY: "money",
  PERCENT: "percent",
  FREESHIP: "freeship",
  // PRODUCT: "product",
};

const VOUCHER_STATUSES = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  EXPIRED: "expired",
};

const VOUCHER_APPLY_FOR = {
  ALL: "all",
  CATEGORY: "category",
  // PRODUCT: "product",
};

const VOUCHER_COLLECTION_SCHEMA = Joi.object({
  code: Joi.string().uppercase().trim().required(),
  name: Joi.string().trim().required(),
  description: Joi.string().allow("").default(""),

  type: Joi.string()
    .valid(...Object.values(VOUCHER_TYPES))
    .required(),
  discountValue: Joi.number().min(0).required(),
  maxDiscountAmount: Joi.number().min(0).allow(null).default(null),
  minOrderValue: Joi.number().min(0).default(0),

  applyFor: Joi.string()
    .valid(...Object.values(VOUCHER_APPLY_FOR))
    .default(VOUCHER_APPLY_FOR.ALL),
  applyForIds: Joi.array().items(Joi.string()).default([]),

  startDate: Joi.date().required(),
  endDate: Joi.date().required(),

  status: Joi.string()
    .valid(...Object.values(VOUCHER_STATUSES))
    .default(VOUCHER_STATUSES.ACTIVE),
  quantity: Joi.number().integer().min(0).required(),
  usedCount: Joi.number().integer().min(0).default(0),
  usageLimitPerUser: Joi.number().integer().min(1).default(1),

  isFeatured: Joi.boolean().default(false),
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

const validateBeforeCreate = async (data) => {
  return await VOUCHER_COLLECTION_SCHEMA.validateAsync(data, {
    abortEarly: false,
  });
};

const createNew = async (data) => {
  try {
    const validData = await validateBeforeCreate(data);
    const persistData = {
      ...validData,
      applyForIds: validData.applyForIds.map((id) => new ObjectId(id)),
      createdAt: validData.createdAt
        ? new Date(validData.createdAt)
        : new Date(),
    };
    if (persistData.createdBy?.createdAt) {
      persistData.createdBy.createdAt = new Date(
        persistData.createdBy.createdAt,
      );
    }
    if (persistData.createdBy?.account_id) {
      persistData.createdBy.account_id = new ObjectId(persistData.createdBy.account_id);
    }
    return await GET_DB()
      .collection(VOUCHER_COLLECTION_NAME)
      .insertOne(persistData);
  } catch (error) {
    throw new Error(error);
  }
};

const findOneById = async (id) => {
  try {
    return await GET_DB()
      .collection(VOUCHER_COLLECTION_NAME)
      .findOne({ _id: new ObjectId(id) });
  } catch (error) {
    throw new Error(error);
  }
};

const findOneByCode = async (code) => {
  try {
    return await GET_DB()
      .collection(VOUCHER_COLLECTION_NAME)
      .findOne({ code: code.toUpperCase(), deleted: false });
  } catch (error) {
    throw new Error(error);
  }
};

const update = async (id, updateData) => {
  try {
    const persistUpdateData = { ...updateData, updatedAt: new Date() };
    if (Array.isArray(persistUpdateData.applyForIds)) {
      persistUpdateData.applyForIds = persistUpdateData.applyForIds.map(
        (id) => new ObjectId(id),
      );
    }

    return await GET_DB()
      .collection(VOUCHER_COLLECTION_NAME)
      .findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: persistUpdateData },
        { returnDocument: "after" },
      );
  } catch (error) {
    throw new Error(error);
  }
};

const pushUpdatedBy = async (id, actorId, actorEmail) => {
  try {
    await GET_DB()
      .collection(VOUCHER_COLLECTION_NAME)
      .updateOne(
        { _id: new ObjectId(id) },
        {
          $push: { updatedBy: { account_id: new ObjectId(actorId), email: actorEmail } },
          $set: { updatedAt: new Date() }
        },
      );
  } catch (error) {
    throw new Error(error);
  }
};

const softDelete = async (id, actorId, actorEmail) => {
  try {
    const result = await GET_DB()
      .collection(VOUCHER_COLLECTION_NAME)
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

/**
 * Danh sách vouchers với $facet pagination
 */
const getList = async ({
  queryConditions = [],
  page = 1,
  limit = 50,
  sort = { isFeatured: -1, createdAt: -1 },
}) => {
  try {
    const matchStage =
      queryConditions.length > 0
        ? { $match: { $and: queryConditions } }
        : { $match: {} };

    const query = await GET_DB()
      .collection(VOUCHER_COLLECTION_NAME)
      .aggregate([
        matchStage,
        { $sort: sort },
        {
          $facet: {
            queryData: [{ $skip: (page - 1) * limit }, { $limit: limit }],
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

const decreaseUsedCount = async (voucherId, options = {}) => {
  try {
    return await GET_DB()
      .collection(VOUCHER_COLLECTION_NAME)
      .updateOne(
        { _id: new ObjectId(voucherId), usedCount: { $gt: 0 } },
        { $inc: { usedCount: -1 } },
        options,
      );
  } catch (error) {
    throw new Error(error);
  }
};

export const voucherModel = {
  VOUCHER_COLLECTION_NAME,
  VOUCHER_TYPES,
  VOUCHER_STATUSES,
  VOUCHER_APPLY_FOR,
  createNew,
  findOneById,
  findOneByCode,
  update,
  pushUpdatedBy,
  softDelete,
  getList,
  decreaseUsedCount,
};
