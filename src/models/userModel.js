import Joi from "joi";
import { ObjectId } from "mongodb";
import { EMAIL_RULE, EMAIL_RULE_MESSAGE } from "~/utils/validators";
import { GET_DB } from "~/config/mongodb";

const USER_ROLES = {
  CLIENT: "client",
  ADMIN: "admin",
};

// Các provider đăng nhập được hỗ trợ
const AUTH_PROVIDERS = {
  LOCAL: "local",
  GOOGLE: "google",
  FACEBOOK: "facebook",
};

const USER_COLLECTION_NAME = "users";
const USER_COLLECTION_SCHEMA = Joi.object({
  email: Joi.string()
    .pattern(EMAIL_RULE)
    .message(EMAIL_RULE_MESSAGE)
    .allow(null)
    .default(null),
  password: Joi.string().allow(null).default(null),
  // username cắt ra từ email và ko unique
  username: Joi.string().required().trim().strict(),
  displayName: Joi.string().required().trim().strict(),
  phone: Joi.string().allow("").default(""),
  avatar: Joi.string().allow(null, "").default(null),
  role: Joi.string()
    .valid(...Object.values(USER_ROLES))
    .default(USER_ROLES.CLIENT),
  roleId: Joi.string().allow(null).default(null),
  address: Joi.string().allow("").default(""),
  gender: Joi.string().allow("").default(""),
  birthday: Joi.string().allow("").default(""),
  isActive: Joi.boolean().default(false),
  verifyToken: Joi.string().allow(null).default(null),
  resetPasswordToken: Joi.string().allow(null).default(null),
  resetPasswordExpiresAt: Joi.date()
    .timestamp("javascript")
    .allow(null)
    .default(null),
  // ── Social Auth Fields ────────────────────────────────────────
  // provider chính của tài khoản: 'local' | 'google' | 'facebook'
  provider: Joi.string()
    .valid(...Object.values(AUTH_PROVIDERS))
    .default(AUTH_PROVIDERS.LOCAL),
  // Lưu danh sách các social account đã liên kết (hỗ trợ multi-provider)
  socialAccounts: Joi.array()
    .items(
      Joi.object({
        provider: Joi.string().valid("google", "facebook").required(),
        socialId: Joi.string().required(),
        linkedAt: Joi.date().timestamp("javascript").default(Date.now),
      }),
    )
    .default([]),
  deleted: Joi.boolean().default(false),
  createdBy: Joi.object({
    account_id: Joi.string(),
    email: Joi.string()
      .required()
      .pattern(EMAIL_RULE)
      .message(EMAIL_RULE_MESSAGE),
  })
    .allow(null)
    .default(null),
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

const INVALID_UPDATE_FIELDS = [
  "_id",
  "email",
  "username",
  "createdAt",
  "provider",
  "socialAccounts",
  "deletedAt",
];

const validateBeforeCreate = async (data) => {
  return USER_COLLECTION_SCHEMA.validateAsync(data, { abortEarly: false });
};

const createNew = async (data) => {
  try {
    const validData = await validateBeforeCreate(data);
    if (validData.roleId) {
      validData.roleId = new ObjectId(String(validData.roleId));
    }
    const createdUser = await GET_DB()
      .collection(USER_COLLECTION_NAME)
      .insertOne(validData);
    return createdUser;
  } catch (error) {
    throw new Error(error);
  }
};

const findOneById = async (userId) => {
  try {
    const result = await GET_DB()
      .collection(USER_COLLECTION_NAME)
      .findOne({
        _id: new ObjectId(userId),
      });
    return result;
  } catch (error) {
    throw new Error(error);
  }
};

const findOneByEmail = async (emailValue) => {
  try {
    const result = await GET_DB().collection(USER_COLLECTION_NAME).findOne({
      email: emailValue,
    });
    return result;
  } catch (error) {
    throw new Error(error);
  }
};

const findOneByResetPasswordToken = async (token) => {
  try {
    const result = await GET_DB().collection(USER_COLLECTION_NAME).findOne({
      resetPasswordToken: token,
    });
    return result;
  } catch (error) {
    throw new Error(error);
  }
};

const update = async (userId, updateData) => {
  try {
    Object.keys(updateData).forEach((fieldName) => {
      if (INVALID_UPDATE_FIELDS.includes(fieldName)) {
        delete updateData[fieldName];
      }
    });

    const persistUpdateData = {
      ...updateData,
      updatedAt: new Date(),
    };

    if (persistUpdateData.roleId) {
      persistUpdateData.roleId = new ObjectId(String(persistUpdateData.roleId));
    }

    const result = await GET_DB()
      .collection(USER_COLLECTION_NAME)
      .findOneAndUpdate(
        { _id: new ObjectId(userId) },
        { $set: persistUpdateData },
        { returnDocument: "after" },
      );

    return result;
  } catch (error) {
    throw new Error(error);
  }
};

const findManyByIds = async (ids = []) => {
  try {
    const objectIds = ids
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id));
    if (!objectIds.length) return [];

    return await GET_DB()
      .collection(USER_COLLECTION_NAME)
      .find({ _id: { $in: objectIds } })
      .toArray();
  } catch (error) {
    throw new Error(error);
  }
};

const getList = async ({
  queryConditions = [],
  page = 1,
  limit = 10,
  sort = { createdAt: -1 },
}) => {
  try {
    const query = await GET_DB()
      .collection(USER_COLLECTION_NAME)
      .aggregate([
        { $match: { $and: queryConditions } },
        {
          $project: {
            password: 0,
            verifyToken: 0,
            resetPasswordToken: 0,
            resetPasswordExpiresAt: 0,
            socialAccounts: 0,
          },
        },
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
      data: res?.queryData || [],
      total: res?.queryTotal?.[0]?.count || 0,
    };
  } catch (error) {
    throw new Error(error);
  }
};

const softDelete = async (id, deletedBy = null) => {
  try {
    if (!ObjectId.isValid(id)) return null;

    const updateData = {
      deleted: true,
      deletedAt: new Date(),
      updatedAt: new Date(),
    };
    if (deletedBy) updateData.deletedBy = deletedBy;

    return await GET_DB()
      .collection(USER_COLLECTION_NAME)
      .findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: updateData },
        { returnDocument: "after" },
      );
  } catch (error) {
    throw new Error(error);
  }
};

const softDeleteMany = async (ids = [], deletedBy = null) => {
  try {
    const objectIds = ids
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id));
    if (!objectIds.length) return { matchedCount: 0, modifiedCount: 0 };

    const updateData = {
      deleted: true,
      deletedAt: new Date(),
      updatedAt: new Date(),
    };
    if (deletedBy) updateData.deletedBy = deletedBy;

    return await GET_DB()
      .collection(USER_COLLECTION_NAME)
      .updateMany({ _id: { $in: objectIds } }, { $set: updateData });
  } catch (error) {
    throw new Error(error);
  }
};

const updateManyStatus = async (ids = [], isActive = false) => {
  try {
    const objectIds = ids
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id));
    if (!objectIds.length) return { matchedCount: 0, modifiedCount: 0 };

    return await GET_DB()
      .collection(USER_COLLECTION_NAME)
      .updateMany(
        { _id: { $in: objectIds } },
        { $set: { isActive, updatedAt: new Date() } },
      );
  } catch (error) {
    throw new Error(error);
  }
};

/**
 * Tìm user theo socialId + provider (dùng cho OAuth callback)
 */
const findOneBySocialId = async (provider, socialId) => {
  try {
    const result = await GET_DB()
      .collection(USER_COLLECTION_NAME)
      .findOne({
        socialAccounts: { $elemMatch: { provider, socialId } },
      });
    return result;
  } catch (error) {
    throw new Error(error);
  }
};

/**
 * Tạo mới user từ social profile (Google / Facebook)
 * Nếu email đã tồn tại → liên kết social account vào user đó (link provider)
 * Nếu chưa tồn tại → tạo user mới và đánh dấu isActive = true ngay lập tức
 */
const upsertSocialUser = async ({
  email,
  displayName,
  avatar,
  provider,
  socialId,
}) => {
  try {
    const db = GET_DB().collection(USER_COLLECTION_NAME);
    const now = new Date();

    // Kiểm tra đã tồn tại social account này chưa
    const existBySocialId = await findOneBySocialId(provider, socialId);
    if (existBySocialId) {
      // Cập nhật thông tin mới nhất từ provider (avatar, displayName)
      await db.findOneAndUpdate(
        { _id: existBySocialId._id },
        {
          $set: {
            ...(avatar && { avatar }),
            ...(displayName && { displayName }),
            updatedAt: now,
          },
        },
        { returnDocument: "after" },
      );
      return existBySocialId;
    }

    // Kiểm tra email đã tồn tại (tài khoản local) để liên kết provider
    if (email) {
      const existByEmail = await findOneByEmail(email);
      if (existByEmail) {
        const updated = await db.findOneAndUpdate(
          { _id: existByEmail._id },
          {
            $addToSet: {
              socialAccounts: { provider, socialId, linkedAt: now },
            },
            $set: {
              ...(avatar && !existByEmail.avatar && { avatar }),
              isActive: true,
              updatedAt: now,
            },
          },
          { returnDocument: "after" },
        );
        return updated;
      }
    }

    // Tạo user mới hoàn toàn
    const nameFromEmail = email
      ? email.split("@")[0]
      : displayName.toLowerCase().replace(/\s+/g, "_");
    const newUser = {
      email: email || null,
      password: null,
      username: nameFromEmail,
      displayName: displayName || nameFromEmail,
      phone: "",
      avatar: avatar || null,
      role: USER_ROLES.CLIENT,
      address: "",
      gender: "",
      birthday: "",
      isActive: true, // social login không cần verify email
      verifyToken: null,
      resetPasswordToken: null,
      resetPasswordExpiresAt: null,
      provider, // provider chính của tài khoản
      socialAccounts: [{ provider, socialId, linkedAt: now }],
      createdAt: now,
      updatedAt: null,
      deleted: false,
    };

    const created = await db.insertOne(newUser);
    return await db.findOne({ _id: created.insertedId });
  } catch (error) {
    throw new Error(error);
  }
};

export const userModel = {
  USER_ROLES,
  AUTH_PROVIDERS,
  USER_COLLECTION_NAME,
  USER_COLLECTION_SCHEMA,
  createNew,
  findOneById,
  findOneByEmail,
  findOneByResetPasswordToken,
  findOneBySocialId,
  upsertSocialUser,
  findManyByIds,
  getList,
  update,
  softDelete,
  softDeleteMany,
  updateManyStatus,
};
