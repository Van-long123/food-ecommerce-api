import { StatusCodes } from 'http-status-codes'
import ApiError from '~/utils/ApiError'
import { addressModel } from '~/models/addressModel'
import { ghnService } from '~/services/ghnService'
import { productModel } from '~/models/productModel'

/**
 * Tính phí vận chuyển cho địa chỉ được chọn.
 * 1. Tìm address theo addressId và xác minh thuộc về userId
 * 2. Gọi GHN available-services để lấy service Nhanh
 * 3. Gọi GHN fee API với district_id và ward_code của địa chỉ
 */
const getShippingFee = async (userId, addressId, products = []) => {
  // 1. Tìm và xác minh địa chỉ
  const address = await addressModel.findOneById(addressId)

  if (!address || address._destroy) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy địa chỉ')
  }

  if (address.userId.toString() !== userId.toString()) {
    throw new ApiError(StatusCodes.FORBIDDEN, 'Địa chỉ không thuộc về bạn')
  }

  // Lấy thêm thông tin unit từ database để tính khối lượng chuẩn xác
  const productIds = products.map(p => p._id)
  const dbProducts = productIds.length > 0 ? await productModel.findManyByIds(productIds) : []

  const enrichedProducts = products.map(p => {
    const dbProduct = dbProducts.find(dp => dp._id.toString() === p._id.toString())
    return {
      ...p,
      unit: dbProduct?.unit || 'g'
    }
  })

  // 2. Gọi GHN để tính phí, kèm theo sản phẩm trong giỏ hàng
  const feeResult = await ghnService.getShippingFee({
    toDistrictId: address.district_id,
    toWardCode:   address.ward_code,
    products:     enrichedProducts // truyền xuống để GHN tính chính xác hơn
  })

  return {
    shippingFee:  feeResult.total,
    isFallback:   feeResult.isFallback,
    address: {
      _id:         address._id,
      username:    address.username,
      phone:       address.phone,
      address:     address.address,
      ward:        address.ward,
      district:    address.district,
      province:    address.province,
      district_id: address.district_id,
      ward_code:   address.ward_code
    }
  }
}

export const checkoutService = {
  getShippingFee
}
