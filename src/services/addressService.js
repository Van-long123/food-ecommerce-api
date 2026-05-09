import { addressModel } from '~/models/addressModel'
import ApiError from '~/utils/ApiError'
import { StatusCodes } from 'http-status-codes'

const getAddresses = async (userId) => {
  try {
    const addresses = await addressModel.findByUserId(userId)
    // Sort default first, then newest
    return addresses.sort((a, b) => {
      if (a.default !== b.default) return b.default - a.default
      return new Date(b.createdAt) - new Date(a.createdAt)
    })
  } catch (error) {
    throw new Error(error)
  }
}

const createAddress = async (userId, data) => {
  try {
    const createData = {
      ...data,
      userId
    }

    // Check if it's the first address, force default = 1
    const existingAddresses = await addressModel.findByUserId(userId)
    if (existingAddresses.length === 0) {
      createData.default = 1
    }

    const createdAddress = await addressModel.createNew(createData)
    const newAddress = await addressModel.findOneById(createdAddress.insertedId)

    // If default is 1, unset others
    if (newAddress.default === 1) {
      await addressModel.unsetDefaultAddresses(userId, newAddress._id)
    }

    return newAddress
  } catch (error) {
    throw new Error(error)
  }
}

const updateAddress = async (userId, addressId, data) => {
  try {
    const address = await addressModel.findOneById(addressId)
    if (!address || address.userId.toString() !== userId.toString() || address._destroy) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy địa chỉ')
    }

    // Prevent unsetting default if it's the only one
    if (data.default === 0 && address.default === 1) {
      const all = await addressModel.findByUserId(userId)
      if (all.length <= 1) {
        data.default = 1 // Force default back to 1
      }
    }

    const updated = await addressModel.update(addressId, {
      ...data,
      updatedAt: Date.now()
    })

    if (updated.default === 1) {
      await addressModel.unsetDefaultAddresses(userId, updated._id)
    } else if (updated.default === 0 && address.default === 1) {
      // If we unset default, we must set another one as default
      const all = await addressModel.findByUserId(userId)
      const others = all.filter(a => a._id.toString() !== updated._id.toString())
      if (others.length > 0) {
        // Find newest
        others.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        await addressModel.update(others[0]._id.toString(), { default: 1 })
      }
    }

    return updated
  } catch (error) {
    throw new Error(error)
  }
}

const deleteAddress = async (userId, addressId) => {
  try {
    const address = await addressModel.findOneById(addressId)
    if (!address || address.userId.toString() !== userId.toString() || address._destroy) {
      throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy địa chỉ')
    }

    await addressModel.deleteById(addressId)

    // If it was default, make another one default
    if (address.default === 1) {
      const remaining = await addressModel.findByUserId(userId)
      if (remaining.length > 0) {
        remaining.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        await addressModel.update(remaining[0]._id.toString(), { default: 1 })
      }
    }

    return { message: 'Xóa địa chỉ thành công' }
  } catch (error) {
    throw new Error(error)
  }
}

export const addressService = {
  getAddresses,
  createAddress,
  updateAddress,
  deleteAddress
}
