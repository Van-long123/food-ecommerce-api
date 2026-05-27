import axios from 'axios'
import ApiError from '~/utils/ApiError'
import { StatusCodes } from 'http-status-codes'
import { GHN_HEADERS, GHN_MASTER_DATA_API, GHN_SHIPPING_ORDER_API, GHN_SHOP_HEADERS } from '~/utils/constants'
import { env } from '~/config/environment'



const getProvinces = async () => {


  const response = await axios.get(`${GHN_MASTER_DATA_API}/province`, {
    headers: GHN_HEADERS
  })

  const data = response.data
  if (data.code !== 200) {
    throw new ApiError(StatusCodes.BAD_REQUEST, data.message || 'Lỗi khi lấy danh sách tỉnh/thành')
  }
  return data.data
}

const getDistricts = async (provinceId) => {


  if (!provinceId) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu province_id')
  }

  const response = await axios.get(`${GHN_MASTER_DATA_API}/district?province_id=${provinceId}`, {
    headers: GHN_HEADERS
  })

  const data = response.data
  if (data.code !== 200) {
    throw new ApiError(StatusCodes.BAD_REQUEST, data.message || 'Lỗi khi lấy danh sách quận/huyện')
  }
  return data.data
}

const getWards = async (districtId) => {


  if (!districtId) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu district_id')
  }

  const response = await axios.get(`${GHN_MASTER_DATA_API}/ward?district_id=${districtId}`, {
    headers: GHN_HEADERS
  })

  const data = response.data
  if (data.code !== 200) {
    throw new ApiError(StatusCodes.BAD_REQUEST, data.message || 'Lỗi khi lấy danh sách phường/xã')
  }
  return data.data
}

/**
 * Lấy danh sách dịch vụ vận chuyển khả dụng giữa 2 quận.
 * Trả về service có short_name = 'Nhanh' */
const getAvailableServices = async (fromDistrictId, toDistrictId) => {
  const body = {
    shop_id: Number(env.GHN_SHOP_ID),
    from_district: Number(fromDistrictId),
    to_district: Number(toDistrictId)
  }

  const response = await axios.post(`${GHN_SHIPPING_ORDER_API}/available-services`, body, {
    headers: GHN_HEADERS
  })

  const data = response.data
  if (data.code !== 200) {
    throw new ApiError(StatusCodes.BAD_REQUEST, data.message || 'Lỗi khi lấy danh sách dịch vụ GHN')
  }

  // Ưu tiên dịch vụ "Nhanh"
  const services = data.data || []
  if (!services?.length) {
  throw new ApiError(StatusCodes.BAD_REQUEST, "GHN không trả về dịch vụ");
}

  return services[0]
}

const getShippingFee = async ({ toDistrictId, toWardCode, products = [] }) => {
  const fromDistrictId = Number(env.GHN_FROM_DISTRICT_ID)
  const fromWardCode   = env.GHN_FROM_WARD_CODE

  // Lấy service_id động từ API nếu env chưa có
  let serviceId     = env.GHN_SERVICE_ID     ? Number(env.GHN_SERVICE_ID)     : null
  let serviceTypeId = env.GHN_SERVICE_TYPE_ID ? Number(env.GHN_SERVICE_TYPE_ID) : null

  if (!serviceId) {
    try {
      const service = await getAvailableServices(fromDistrictId, Number(toDistrictId))
      serviceId     = service.service_id
      serviceTypeId = service.service_type_id
    } catch (error) {
      const fallback = Number(env.GHN_FALLBACK_FEE) || 25000
      return { total: fallback, isFallback: true }
    }
  }

  // Dimension mặc định per-item (GHN yêu cầu đơn vị: gram, cm)
  const defaultWeight = Number(env.GHN_DEFAULT_WEIGHT) || 500   // gram
  const defaultLength = Number(env.GHN_DEFAULT_LENGTH) || 20    // cm
  const defaultWidth  = Number(env.GHN_DEFAULT_WIDTH)  || 15    // cm
  const defaultHeight = Number(env.GHN_DEFAULT_HEIGHT) || 10    // cm

  // Map giỏ hàng → GHN items[]
  // GHN dùng items[] để tính tổng trọng lượng và kích thước kiện
  const items = products.length > 0
    ? products.map(p => {
        let itemWeight = defaultWeight
        
        if (p.unit === 'kg') {
          itemWeight = 1000
        } else if (p.unit === 'g') {
          itemWeight = 1
        }

        return {
          name:     String(p.name).substring(0, 100), // GHN giới hạn dô dài tên
          quantity: Number(p.quantity) || 1,
          weight:   itemWeight,
          length:   defaultLength,
          width:    defaultWidth,
          height:   defaultHeight
        }
      })
    : [{ name: 'San pham', quantity: 1, weight: defaultWeight, length: defaultLength, width: defaultWidth, height: defaultHeight }]

  // Tổng trọng lượng toàn đơn (gram)
  const totalWeight = items.reduce((sum, item) => sum + item.weight * item.quantity, 0)

  const body = {
    from_district_id: fromDistrictId,
    from_ward_code:   fromWardCode,
    service_id:       serviceId,
    service_type_id:  serviceTypeId || null,
    to_district_id:   Number(toDistrictId),
    to_ward_code:     String(toWardCode),
    weight:           totalWeight,
    length:           defaultLength,
    width:            defaultWidth,
    height:           defaultHeight,
    insurance_value:  0,
    coupon:           null,
    items
  }

  const response = await axios.post(`${GHN_SHIPPING_ORDER_API}/fee`, body, {
    headers: GHN_SHOP_HEADERS
  })

  const data = response.data
  if (data.code !== 200) {
    // Fallback fee nếu GHN trả lỗi
    const fallback = Number(env.GHN_FALLBACK_FEE) || 25000
    return { total: fallback, isFallback: true }
  }

  return { total: data.data.total, isFallback: false }
}

export const ghnService = {
  getProvinces,
  getDistricts,
  getWards,
  getAvailableServices,
  getShippingFee
}
