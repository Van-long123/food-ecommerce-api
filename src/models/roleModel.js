import Joi from 'joi'
import { ObjectId } from 'mongodb'
import { GET_DB } from '~/config/mongodb'

const ROLE_COLLECTION_NAME = 'roles'

const ROLE_COLLECTION_SCHEMA = Joi.object({
  title: Joi.string().required().trim().strict(),
  description: Joi.string().allow('').default(''),
  permissions: Joi.array().items(Joi.string()).default([]),
  deleted: Joi.boolean().default(false),
  createdAt: Joi.date().default(Date.now),
  updatedAt: Joi.date().allow(null).default(null),
  deletedAt: Joi.date().allow(null).default(null)
})

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

    // Filter invalid update fields
    const invalidUpdateFields = ['_id', 'createdAt']
    const cleanUpdateData = { ...updateData }
    invalidUpdateFields.forEach((field) => {
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

export const roleModel = {
  ROLE_COLLECTION_NAME,
  ROLE_COLLECTION_SCHEMA,
  createNew,
  findOneById,
  update
}
