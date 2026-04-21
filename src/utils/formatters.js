import { pick } from 'lodash'
export const pickUser = (user) => {
  if (!user) return {}

  return {
    _id: user._id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    phone: user.phone,
    avatar: user.avatar,
    role: user.role,
    address: user.address,
    ward: user.ward,
    ward_code: user.ward_code,
    district: user.district,
    district_code: user.district_code,
    province: user.province,
    province_code: user.province_code,
    gender: user.gender,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}
export const slugify = (val) => {
  if (!val) return ''
  return String(val)
    .normalize('NFKD')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}