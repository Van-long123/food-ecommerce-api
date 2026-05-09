import ApiError from '~/utils/ApiError'
import { StatusCodes } from 'http-status-codes'
import { GHN_HEADERS, GHN_MASTER_DATA_API } from '~/utils/constants'



const getProvinces = async () => {


  const response = await fetch(`${GHN_MASTER_DATA_API}/province`, {
    method: 'GET',
    headers: GHN_HEADERS
  })

  const data = await response.json()
  if (data.code !== 200) {
    throw new ApiError(StatusCodes.BAD_REQUEST, data.message || 'Lỗi khi lấy danh sách tỉnh/thành')
  }
  return data.data
}

const getDistricts = async (provinceId) => {


  if (!provinceId) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu province_id')
  }

  const response = await fetch(`${GHN_MASTER_DATA_API}/district?province_id=${provinceId}`, {
    method: 'GET',
    headers: GHN_HEADERS
  })

  const data = await response.json()
  if (data.code !== 200) {
    throw new ApiError(StatusCodes.BAD_REQUEST, data.message || 'Lỗi khi lấy danh sách quận/huyện')
  }
  return data.data
}

const getWards = async (districtId) => {


  if (!districtId) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu district_id')
  }

  const response = await fetch(`${GHN_MASTER_DATA_API}/ward?district_id=${districtId}`, {
    method: 'GET',
    headers: GHN_HEADERS
  })

  const data = await response.json()
  if (data.code !== 200) {
    throw new ApiError(StatusCodes.BAD_REQUEST, data.message || 'Lỗi khi lấy danh sách phường/xã')
  }
  return data.data
}

export const ghnService = {
  getProvinces,
  getDistricts,
  getWards
}
