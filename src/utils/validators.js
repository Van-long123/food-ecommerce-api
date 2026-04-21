export const EMAIL_RULE = /^\S+@\S+\.\S+$/
export const EMAIL_RULE_MESSAGE = 'Email không hợp lệ. Ví dụ: example@domain.com'

export const PASSWORD_RULE = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,256}$/
export const PASSWORD_RULE_MESSAGE = 'Mật khẩu phải có ít nhất 8 ký tự, chứa ít nhất 1 chữ hoa, 1 số và 1 ký tự đặc biệt (!@#...)'
// Liên quan đến Validate File
export const LIMIT_FILE_SIZE = 10485760 // byte = 10 MB
export const ALLOW_FILE_TYPES = ['image/jpg', 'image/jpeg', 'image/png']