import Joi from "joi";
import { ObjectId } from "mongodb";
import { GET_DB } from "~/config/mongodb";

const ADDRESS_COLLECTION_NAME = "addresses";
const ADDRESS_COLLECTION_SCHEMA = Joi.object({
  userId: Joi.string()
    .required()
    .pattern(/^[0-9a-fA-F]{24}$/),
  username: Joi.string().required().trim(),
  address: Joi.string().required().trim(), // Detail street/house number
  phone: Joi.string().required().trim(),

  province: Joi.string().required().trim(),
  district: Joi.string().required().trim(),
  ward: Joi.string().required().trim(),

  province_id: Joi.number().required(),
  district_id: Joi.number().required(),
  ward_code: Joi.string().required(),

  default: Joi.number().valid(0, 1).default(0),
  createdAt: Joi.date().default(() => new Date()),
  updatedAt: Joi.date().default(null),
  deleted: Joi.boolean().default(false),
  deletedAt: Joi.date().default(null),
});

const INVALID_UPDATE_FIELDS = ["_id", "userId", "createdAt", "deletedAt"];

const validateBeforeCreate = async (data) => {
  return ADDRESS_COLLECTION_SCHEMA.validateAsync(data, { abortEarly: false });
};

const createNew = async (data) => {
  try {
    const validData = await validateBeforeCreate(data);
    // Convert userId string to ObjectId
    const result = await GET_DB()
      .collection(ADDRESS_COLLECTION_NAME)
      .insertOne({
        ...validData,
        userId: new ObjectId(validData.userId),
      });
    return result;
  } catch (error) {
    throw new Error(error);
  }
};

const findOneById = async (id) => {
  try {
    const result = await GET_DB()
      .collection(ADDRESS_COLLECTION_NAME)
      .findOne({
        _id: new ObjectId(id),
      });
    return result;
  } catch (error) {
    throw new Error(error);
  }
};

const findByUserId = async (userId) => {
  try {
    const result = await GET_DB()
      .collection(ADDRESS_COLLECTION_NAME)
      .find({
        userId: new ObjectId(userId),
        deleted: false,
      })
      .toArray();
    return result;
  } catch (error) {
    throw new Error(error);
  }
};

const update = async (id, updateData) => {
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

    const result = await GET_DB()
      .collection(ADDRESS_COLLECTION_NAME)
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

const unsetDefaultAddresses = async (userId, excludeAddressId = null) => {
  try {
    const filter = { userId: new ObjectId(userId) };
    if (excludeAddressId) {
      filter._id = { $ne: new ObjectId(excludeAddressId) };
    }

    await GET_DB()
      .collection(ADDRESS_COLLECTION_NAME)
      .updateMany(filter, { $set: { default: 0 } });
  } catch (error) {
    throw new Error(error);
  }
};

const deleteById = async (id) => {
  try {
    // Soft delete
    const result = await GET_DB()
      .collection(ADDRESS_COLLECTION_NAME)
      .findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: { deleted: true, deletedAt: new Date() } },
        { returnDocument: "after" },
      );
    return result;
  } catch (error) {
    throw new Error(error);
  }
};

export const addressModel = {
  ADDRESS_COLLECTION_NAME,
  ADDRESS_COLLECTION_SCHEMA,
  createNew,
  findOneById,
  findByUserId,
  update,
  unsetDefaultAddresses,
  deleteById,
};
