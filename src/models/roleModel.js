import Joi from 'joi'
import { ObjectId } from 'mongodb'
import { GET_DB } from '~/config/mongodb'

const ROLE_COLLECTION_NAME = 'roles'

const ROLE_COLLECTION_SCHEMA = Joi.object({
  title: Joi.string().required().trim().strict(),
  description: Joi.string().allow('').default(''),
  permissions: Joi.array().items(Joi.string()).default([]),
  isSystem: Joi.boolean().default(false),
  deleted: Joi.boolean().default(false),
  createdAt: Joi.date().default(() => new Date()),
  updatedAt: Joi.date().allow(null).default(null),
  deletedAt: Joi.date().allow(null).default(null)
})

const INVALID_UPDATE_FIELDS = ['_id', 'createdAt', 'deletedAt', 'isSystem']

const validateBeforeCreate = async (data) => {
  return ROLE_COLLECTION_SCHEMA.validateAsync(data, { abortEarly: false })
}

const createNew = async (data) => {
  try {
    const validData = await validateBeforeCreate(data)
    const created = await GET_DB().collection(ROLE_COLLECTION_NAME).insertOne(validData)
    return created
  } catch (error) {
    throw new Error(error)
  }
}

const findOneById = async (id) => {
  try {
    if (!ObjectId.isValid(id)) return null
    return await GET_DB().collection(ROLE_COLLECTION_NAME).findOne({
      _id: new ObjectId(id)
    })
  } catch (error) {
    throw new Error(error)
  }
}

const update = async (id, updateData) => {
  try {
    if (!ObjectId.isValid(id)) return null

    const cleanUpdateData = { ...updateData }
    INVALID_UPDATE_FIELDS.forEach((field) => {
      delete cleanUpdateData[field]
    })

    cleanUpdateData.updatedAt = new Date()

    return await GET_DB().collection(ROLE_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: cleanUpdateData },
      { returnDocument: 'after' }
    )
  } catch (error) {
    throw new Error(error)
  }
}

const findManyByIds = async (ids = []) => {
  try {
    const objectIds = ids
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id))
    if (!objectIds.length) return []

    return await GET_DB()
      .collection(ROLE_COLLECTION_NAME)
      .find({ _id: { $in: objectIds } })
      .toArray()
  } catch (error) {
    throw new Error(error)
  }
}

const getList = async ({
  queryConditions = [],
  page = 1,
  limit = 10,
  sort = { createdAt: -1 }
}) => {
  try {
    const query = await GET_DB()
      .collection(ROLE_COLLECTION_NAME)
      .aggregate([
        { $match: { $and: queryConditions } },
        { $addFields: { roleIdStr: { $toString: '$_id' } } },
        {
          $lookup: {
            from: 'users',
            let: { roleId: '$roleIdStr' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: [{ $toString: '$roleId' }, '$$roleId'] }
                }
              },
              { $match: { deleted: false } },
              { $count: 'count' }
            ],
            as: 'usersMeta'
          }
        },
        {
          $addFields: {
            usersCount: {
              $ifNull: [{ $arrayElemAt: ['$usersMeta.count', 0] }, 0]
            },
            permissionsCount: {
              $size: { $ifNull: ['$permissions', []] }
            }
          }
        },
        { $project: { usersMeta: 0, roleIdStr: 0 } },
        { $sort: sort },
        {
          $facet: {
            queryData: [{ $skip: (page - 1) * limit }, { $limit: limit }],
            queryTotal: [{ $count: 'count' }]
          }
        }
      ])
      .toArray()

    const res = query[0]
    return {
      data: res?.queryData || [],
      total: res?.queryTotal?.[0]?.count || 0
    }
  } catch (error) {
    throw new Error(error)
  }
}

const softDelete = async (id) => {
  try {
    if (!ObjectId.isValid(id)) return null

    return await GET_DB().collection(ROLE_COLLECTION_NAME).findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { deleted: true, deletedAt: new Date(), updatedAt: new Date() } },
      { returnDocument: 'after' }
    )
  } catch (error) {
    throw new Error(error)
  }
}

const softDeleteMany = async (ids = []) => {
  try {
    const objectIds = ids
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id))
    if (!objectIds.length) return { matchedCount: 0, modifiedCount: 0 }

    return await GET_DB().collection(ROLE_COLLECTION_NAME).updateMany(
      { _id: { $in: objectIds } },
      { $set: { deleted: true, deletedAt: new Date(), updatedAt: new Date() } }
    )
  } catch (error) {
    throw new Error(error)
  }
}

export const roleModel = {
  ROLE_COLLECTION_NAME,
  ROLE_COLLECTION_SCHEMA,
  createNew,
  findOneById,
  findManyByIds,
  getList,
  update,
  softDelete,
  softDeleteMany
}
