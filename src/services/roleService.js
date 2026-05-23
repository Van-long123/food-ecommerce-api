import { StatusCodes } from 'http-status-codes'
import { env } from '~/config/environment'
import { roleModel } from '~/models/roleModel'
import ApiError from '~/utils/ApiError'

const parsePermissions = (permissions) => {
  if (Array.isArray(permissions)) return permissions
  if (typeof permissions === 'string' && permissions.trim()) return [permissions.trim()]
  return []
}

const normalizePermissions = (permissions = []) => {
  const normalized = permissions
    .map((item) => String(item || '').trim())
    .filter(Boolean)
  return Array.from(new Set(normalized))
}

const getSystemRoleIds = () => {
  const raw = String(env.SYSTEM_ROLE_IDS || '')
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
}

const isSystemRole = (role) => {
  if (!role) return false
  if (role.isSystem) return true
  const systemIds = getSystemRoleIds()
  return systemIds.includes(String(role._id))
}

const getListAdmin = async (query) => {
  try {
    const page = parseInt(query.page) || 1
    const limit = parseInt(query.limit) || 10
    const sortField = query.sortField || 'createdAt'
    const sortOrder = query.sortOrder === 'asc' ? 1 : -1

    const allowedSortFields = ['title', 'description', 'createdAt', 'updatedAt', 'usersCount']
    const safeSortField = allowedSortFields.includes(sortField) ? sortField : 'createdAt'

    const queryConditions = [{ deleted: false }]
    if (query.keyword) {
      queryConditions.push({
        $or: [
          { title: { $regex: new RegExp(query.keyword, 'i') } },
          { description: { $regex: new RegExp(query.keyword, 'i') } }
        ]
      })
    }

    const { data, total } = await roleModel.getList({
      queryConditions,
      page,
      limit,
      sort: { [safeSortField]: sortOrder }
    })

    const systemRoleIds = getSystemRoleIds()
    const normalizedData = data.map((role) => ({
      ...role,
      isSystem: role.isSystem || systemRoleIds.includes(String(role._id))
    }))

    return {
      data: normalizedData,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    }
  } catch (error) {
    throw error
  }
}

const getDetailAdmin = async (id) => {
  try {
    const role = await roleModel.findOneById(id)
    if (!role || role.deleted) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy vai trò!')
    }
    const systemRoleIds = getSystemRoleIds()
    return {
      ...role,
      isSystem: role.isSystem || systemRoleIds.includes(String(role._id))
    }
  } catch (error) {
    throw error
  }
}

const createNew = async (reqBody) => {
  try {
    const permissions = normalizePermissions(parsePermissions(reqBody.permissions))

    const payload = {
      title: reqBody.title,
      description: reqBody.description || '',
      permissions
    }

    const created = await roleModel.createNew(payload)
    return await roleModel.findOneById(created.insertedId)
  } catch (error) {
    throw error
  }
}

const update = async (id, reqBody) => {
  try {
    const role = await roleModel.findOneById(id)
    if (!role || role.deleted) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy vai trò!')
    }

    const updateData = {
      title: reqBody.title,
      description: reqBody.description
    }

    if (reqBody.permissions !== undefined) {
      updateData.permissions = normalizePermissions(parsePermissions(reqBody.permissions))
    }

    Object.keys(updateData).forEach((key) => {
      if (updateData[key] === undefined) delete updateData[key]
    })

    return await roleModel.update(id, updateData)
  } catch (error) {
    throw error
  }
}

const softDelete = async (id) => {
  try {
    const role = await roleModel.findOneById(id)
    if (!role || role.deleted) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy vai trò!')
    }
    if (isSystemRole(role)) {
      throw new ApiError(StatusCodes.FORBIDDEN, 'Không thể xóa vai trò hệ thống!')
    }

    return await roleModel.softDelete(id)
  } catch (error) {
    throw error
  }
}

const softDeleteMany = async (ids = []) => {
  try {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new ApiError(StatusCodes.BAD_REQUEST, 'Danh sách vai trò cần xóa không hợp lệ!')
    }

    const roles = await roleModel.findManyByIds(ids)
    if (!roles.length) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy vai trò!')
    }

    const hasSystemRole = roles.some((role) => isSystemRole(role))
    if (hasSystemRole) {
      throw new ApiError(StatusCodes.FORBIDDEN, 'Không thể xóa vai trò hệ thống!')
    }

    const result = await roleModel.softDeleteMany(ids)
    return { deletedCount: result?.modifiedCount || 0 }
  } catch (error) {
    throw error
  }
}

export const roleService = {
  getListAdmin,
  getDetailAdmin,
  createNew,
  update,
  softDelete,
  softDeleteMany
}
