import Joi from 'joi'
import { GET_DB } from '~/config/mongodb'

const SETTINGS_GENERAL_COLLECTION_NAME = 'settings_general'

const SETTINGS_GENERAL_COLLECTION_SCHEMA = Joi.object({
  websiteName: Joi.string().allow('').default(''),
  logo: Joi.string().allow('').default(''),
  phone: Joi.string().allow('').default(''),
  email: Joi.string().allow('').default(''),
  address: Joi.string().allow('').default(''),
  copyright: Joi.string().allow('').default(''),
  createdAt: Joi.date().default(Date.now),
  updatedAt: Joi.date().allow(null).default(null)
})

const validateBeforeCreate = async (data) => {
  return SETTINGS_GENERAL_COLLECTION_SCHEMA.validateAsync(data, { abortEarly: false })
}

const createNew = async (data) => {
  try {
    const validData = await validateBeforeCreate(data)
    const created = await GET_DB().collection(SETTINGS_GENERAL_COLLECTION_NAME).insertOne(validData)
    return created
  } catch (error) {
    throw new Error(error)
  }
}

const getSettings = async () => {
  try {
    return await GET_DB().collection(SETTINGS_GENERAL_COLLECTION_NAME).findOne({})
  } catch (error) {
    throw new Error(error)
  }
}

const updateSettings = async (updateData) => {
  try {
    const invalidUpdateFields = ['_id', 'createdAt']
    const cleanUpdateData = { ...updateData }
    invalidUpdateFields.forEach((field) => {
      delete cleanUpdateData[field]
    })

    cleanUpdateData.updatedAt = new Date()

    return await GET_DB().collection(SETTINGS_GENERAL_COLLECTION_NAME).findOneAndUpdate(
      {}, // Update the single general settings document
      { $set: cleanUpdateData },
      { returnDocument: 'after', upsert: true } // Upsert if settings don't exist yet
    )
  } catch (error) {
    throw new Error(error)
  }
}

export const settingsGeneralModel = {
  SETTINGS_GENERAL_COLLECTION_NAME,
  SETTINGS_GENERAL_COLLECTION_SCHEMA,
  createNew,
  getSettings,
  updateSettings
}
