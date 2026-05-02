import { StatusCodes } from 'http-status-codes'
import bcryptjs from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { userModel } from '~/models/userModel'
import ApiError from '~/utils/ApiError'
import { pickUser } from '~/utils/formatters'
import { jwtProvider } from '~/providers/jwtProvider'
import { env } from '~/config/environment'
import { WEBSITE_DOMAIN } from '~/utils/constants'
import { sendMail } from '~/utils/sendMail'
import { CloudinaryProvider } from '~/providers/CloudinaryProvider'

const RESET_PASSWORD_TOKEN_LIFE = 1000 * 60 * 15

const createNew = async (reqBody) => {
  try {
    const existUser = await userModel.findOneByEmail(reqBody.email)
    if (existUser) throw new ApiError(StatusCodes.CONFLICT, 'Email đã tồn tại!')

    const nameFromEmail = reqBody.email.split('@')[0]
    const newUser = {
      email: reqBody.email,
      password: bcryptjs.hashSync(reqBody.password, 8),
      username: nameFromEmail,
      displayName: reqBody.displayName || nameFromEmail,
      phone: reqBody.phone,
      verifyToken: uuidv4()
    }

    const createdUser = await userModel.createNew(newUser)
    const getNewUser = await userModel.findOneById(createdUser.insertedId)

    const verificationLink = `${WEBSITE_DOMAIN}/account/verification?email=${getNewUser.email}&token=${getNewUser.verifyToken}`
    const customSubject = 'SmartFood: Vui lòng xác thực email trước khi sử dụng dịch vụ'
    const htmlContent = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Xác thực Email — SmartFood</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">

          <!-- ── LOGO HEADER ── -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="
                    background:#F97316;
                    border-radius:12px;
                    padding:10px 20px;
                    display:inline-block;
                  ">
                    <span style="
                      color:#ffffff;
                      font-size:20px;
                      font-weight:800;
                      letter-spacing:1px;
                      text-transform:uppercase;
                    ">🌿 SMARTFOOD</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── MAIN CARD ── -->
          <tr>
            <td style="
              background:#ffffff;
              border-radius:20px;
              overflow:hidden;
              box-shadow:0 4px 32px rgba(0,0,0,0.08);
              border:1px solid #E5E7EB;
            ">

              <!-- Hero banner -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="
                    background:linear-gradient(135deg,#F97316 0%,#EA580C 50%,#16A34A 100%);
                    padding:48px 32px 40px;
                    text-align:center;
                    position:relative;
                  ">
                    <!-- Icon circle -->
                    <div style="
                      display:inline-block;
                      background:rgba(255,255,255,0.18);
                      border:2px solid rgba(255,255,255,0.35);
                      border-radius:50%;
                      width:80px;
                      height:80px;
                      line-height:80px;
                      text-align:center;
                      margin-bottom:20px;
                      font-size:36px;
                    ">✉️</div>

                    <h1 style="
                      margin:0 0 8px;
                      color:#ffffff;
                      font-size:28px;
                      font-weight:800;
                      letter-spacing:-0.5px;
                      line-height:1.2;
                    ">Xác Thực Email</h1>

                    <p style="
                      margin:0;
                      color:rgba(255,255,255,0.85);
                      font-size:15px;
                      font-weight:400;
                    ">Chào mừng bạn đến với SmartFood! 🎉</p>
                  </td>
                </tr>
              </table>

              <!-- Body -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:40px 40px 32px;">

                    <!-- Greeting -->
                    <p style="
                      margin:0 0 8px;
                      color:#111827;
                      font-size:22px;
                      font-weight:700;
                      line-height:1.3;
                    ">Xin chào! 👋</p>

                    <p style="
                      margin:0 0 28px;
                      color:#4B5563;
                      font-size:15px;
                      line-height:1.7;
                    ">
                      Cảm ơn bạn đã đăng ký tài khoản tại <strong style="color:#F97316;">SmartFood</strong> —
                      nền tảng thực phẩm sạch, an toàn cho mọi gia đình Việt.<br/><br/>
                      Vui lòng nhấn nút bên dưới để xác thực địa chỉ email và bắt đầu hành trình
                      mua sắm thực phẩm tươi ngon cùng chúng tôi!
                    </p>

                    <!-- CTA Button -->
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="padding:4px 0 36px;">
                          <a href="${verificationLink}" style="
                            display:inline-block;
                            background:linear-gradient(135deg,#F97316,#EA580C);
                            color:#ffffff;
                            text-decoration:none;
                            font-size:16px;
                            font-weight:700;
                            letter-spacing:0.3px;
                            padding:16px 48px;
                            border-radius:100px;
                            box-shadow:0 8px 24px rgba(249,115,22,0.35);
                          ">
                            ✅ Xác Thực Email Ngay
                          </a>
                        </td>
                      </tr>
                    </table>

                    <!-- Divider -->
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="border-top:1px solid #F3F4F6;padding-bottom:28px;"></td>
                      </tr>
                    </table>

                    <!-- Benefits row -->
                    <p style="
                      margin:0 0 16px;
                      color:#6B7280;
                      font-size:13px;
                      font-weight:600;
                      text-transform:uppercase;
                      letter-spacing:0.6px;
                    ">Sau khi xác thực, bạn sẽ nhận được:</p>

                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding-bottom:12px;">
                          <table cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="
                                background:#FFF7ED;
                                border-radius:10px;
                                padding:12px 16px;
                                width:100%;
                              ">
                                <span style="font-size:18px;">🎁</span>
                                <span style="
                                  color:#92400E;
                                  font-size:14px;
                                  font-weight:600;
                                  margin-left:10px;
                                ">Voucher chào mừng <strong style="color:#EA580C;">50.000đ</strong> cho đơn đầu tiên</span>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom:28px;">
                          <table cellpadding="0" cellspacing="0" border="0" width="100%">
                            <tr>
                              <td style="
                                background:#EFF6FF;
                                border-radius:10px;
                                padding:12px 16px;
                              ">
                                <span style="font-size:18px;">🔔</span>
                                <span style="
                                  color:#1E40AF;
                                  font-size:14px;
                                  font-weight:600;
                                  margin-left:10px;
                                ">Nhận thông báo Flash Sale độc quyền</span>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <!-- Link fallback -->
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="
                          background:#F9FAFB;
                          border:1px dashed #E5E7EB;
                          border-radius:10px;
                          padding:16px;
                          margin-bottom:8px;
                        ">
                          <p style="margin:0 0 6px;color:#6B7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">
                            Nút không hoạt động? Sao chép link bên dưới:
                          </p>
                          <p style="
                            margin:0;
                            color:#F97316;
                            font-size:12px;
                            word-break:break-all;
                            line-height:1.5;
                          ">${verificationLink}</p>
                        </td>
                      </tr>
                    </table>

                    <!-- Warning note -->
                    <p style="
                      margin:20px 0 0;
                      color:#9CA3AF;
                      font-size:13px;
                      line-height:1.6;
                      text-align:center;
                    ">
                      ⏰ Link xác thực có hiệu lực trong <strong style="color:#374151;">24 giờ</strong>.<br/>
                      Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email.
                    </p>

                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- ── FOOTER ── -->
          <tr>
            <td style="
              background:#1F2937;
              border-radius:0 0 20px 20px;
              padding:32px 40px;
              text-align:center;
            ">
              <!-- Social / brand -->
              <p style="margin:0 0 12px;">
                <span style="
                  color:#ffffff;
                  font-size:16px;
                  font-weight:800;
                  letter-spacing:0.5px;
                ">🌿 SMARTFOOD</span>
              </p>
              <p style="
                margin:0 0 16px;
                color:#9CA3AF;
                font-size:13px;
                line-height:1.5;
              ">
                Thực phẩm sạch — Sống khỏe mỗi ngày<br/>
                📍 123 Nguyễn Văn Linh, phường Nam Dương, Quận Hải Châu, Thành phố
                Đà Nẵng, Việt Nam
              </p>

              <!-- Divider -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-top:1px solid #374151;padding:16px 0 0;"></td>
                </tr>
              </table>

              <p style="
                margin:0;
                color:#6B7280;
                font-size:11px;
                line-height:1.6;
              ">
                Email này được gửi tự động từ hệ thống SmartFood.<br/>
                Vui lòng không trả lời email này.<br/>
                © 2025 SmartFood. All rights reserved.
              </p>
            </td>
          </tr>

          <!-- spacer -->
          <tr><td style="height:32px;"></td></tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
`

    await sendMail(getNewUser.email, customSubject, htmlContent)

    return pickUser(getNewUser)
  } catch (error) {
    throw error
  }
}

const verifyAccount = async (reqBody) => {
  try {
    const existUser = await userModel.findOneByEmail(reqBody.email)
    if (!existUser) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy tài khoản!')
    if (existUser.isActive) throw new ApiError(StatusCodes.NOT_ACCEPTABLE, 'Tài khoản đã được kích hoạt!')
    if (existUser.verifyToken !== reqBody.token) throw new ApiError(StatusCodes.NOT_ACCEPTABLE, 'Mã xác thực không hợp lệ!')

    const updateData = {
      isActive: true,
      verifyToken: null,
      updatedAt: Date.now()
    }

    const updatedUser = await userModel.update(existUser._id, updateData)
    return pickUser(updatedUser)
  } catch (error) {
    throw error
  }
}

const login = async (reqBody) => {
  try {
    const existUser = await userModel.findOneByEmail(reqBody.email)

    if (!existUser) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy tài khoản!')
    if (!existUser.isActive) throw new ApiError(StatusCodes.NOT_ACCEPTABLE, 'Tài khoản chưa được kích hoạt!')

    // Kiểm tra nếu tài khoản chưa có mật khẩu (đăng ký qua Social)
    if (!existUser.password) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        `Tài khoản đã liên kết với ${existUser.provider}. Vui lòng đăng nhập bằng ${existUser.provider} hoặc dùng “Quên mật khẩu”.`
      )
    }

    if (!bcryptjs.compareSync(reqBody.password, existUser.password)) {
      throw new ApiError(StatusCodes.NOT_ACCEPTABLE, 'Email hoặc mật khẩu không đúng!')
    }

    const userInfo = {
      _id: existUser._id.toString(),
      email: existUser.email
    }

    const accessToken = await jwtProvider.generateToken(
      userInfo,
      env.ACCESS_TOKEN_PRIVATE_KEY,
      // env.ACCESS_TOKEN_LIFE
      '10s'
    )

    const refreshToken = await jwtProvider.generateToken(
      userInfo,
      env.REFRESH_TOKEN_PRIVATE_KEY,
      // env.REFRESH_TOKEN_LIFE
      '20s'
    )

    return { accessToken, refreshToken, ...pickUser(existUser) }
  } catch (error) {
    throw error
  }
}

const refreshToken = async (clientRefreshToken) => {
  try {
    if (!clientRefreshToken) throw new ApiError(StatusCodes.UNAUTHORIZED, 'Thiếu refresh token!')

    const refreshTokenDecoded = await jwtProvider.verifyToken(clientRefreshToken, env.REFRESH_TOKEN_PRIVATE_KEY)

    const userInfo = {
      _id: refreshTokenDecoded._id,
      email: refreshTokenDecoded.email
    }

    const accessToken = await jwtProvider.generateToken(
      userInfo,
      env.ACCESS_TOKEN_PRIVATE_KEY,
      env.ACCESS_TOKEN_LIFE
    )

    return { accessToken }
  } catch (error) {
    throw error
  }
}

const forgotPassword = async (reqBody) => {
  try {
    const existUser = await userModel.findOneByEmail(reqBody.email)
    if (!existUser) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy tài khoản!')

    const resetPasswordToken = uuidv4()
    const resetPasswordExpiresAt = Date.now() + RESET_PASSWORD_TOKEN_LIFE

    await userModel.update(existUser._id, {
      resetPasswordToken,
      resetPasswordExpiresAt,
      updatedAt: Date.now()
    })

    const resetLink = `${WEBSITE_DOMAIN}/auth/change-password?email=${encodeURIComponent(existUser.email)}&token=${resetPasswordToken}`
    const customSubject = 'SmartFood: Đặt lại mật khẩu'
    const htmlContent = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Đặt lại mật khẩu — SmartFood</title>
</head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:'Segoe UI',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F3F4F6;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">

          <!-- LOGO -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#F97316;border-radius:12px;padding:10px 22px;">
                    <span style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:1px;text-transform:uppercase;">
                      🌿 SMARTFOOD
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CARD -->
          <tr>
            <td style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.08);border:1px solid #E5E7EB;">

              <!-- Hero banner -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:linear-gradient(135deg,#1E40AF 0%,#1D4ED8 50%,#16A34A 100%);padding:48px 32px 40px;text-align:center;">
                    <div style="display:inline-block;background:rgba(255,255,255,0.18);border:2px solid rgba(255,255,255,0.35);border-radius:50%;width:80px;height:80px;line-height:80px;text-align:center;margin-bottom:20px;font-size:36px;">
                      🔐
                    </div>
                    <h1 style="margin:0 0 8px;color:#ffffff;font-size:28px;font-weight:800;letter-spacing:-0.5px;line-height:1.2;">
                      Đặt Lại Mật Khẩu
                    </h1>
                    <p style="margin:0;color:rgba(255,255,255,0.85);font-size:15px;">
                      Bảo mật tài khoản SmartFood của bạn 🛡️
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Body -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:40px 40px 32px;">

                    <!-- Greeting -->
                    <p style="margin:0 0 8px;color:#111827;font-size:22px;font-weight:700;line-height:1.3;">
                      Xin chào! 👋
                    </p>
                    <p style="margin:0 0 28px;color:#4B5563;font-size:15px;line-height:1.7;">
                      Chúng tôi đã nhận được yêu cầu <strong style="color:#1D4ED8;">đặt lại mật khẩu</strong>
                      cho tài khoản <strong style="color:#F97316;">SmartFood</strong> của bạn.<br/><br/>
                      Nhấn vào nút bên dưới để tạo mật khẩu mới. Nếu bạn không thực hiện
                      yêu cầu này, hãy bỏ qua email và tài khoản của bạn vẫn an toàn.
                    </p>

                    <!-- CTA -->
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="padding:4px 0 36px;">
                          <a href="${resetLink}" style="display:inline-block;background:linear-gradient(135deg,#1D4ED8,#1E40AF);color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;letter-spacing:0.3px;padding:16px 48px;border-radius:100px;box-shadow:0 8px 24px rgba(29,78,216,0.35);">
                            🔑 Đặt Lại Mật Khẩu Ngay
                          </a>
                        </td>
                      </tr>
                    </table>

                    <!-- Divider -->
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr><td style="border-top:1px solid #F3F4F6;padding-bottom:28px;"></td></tr>
                    </table>

                    <!-- Warning box -->
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
                      <tr>
                        <td style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:12px;padding:16px 20px;">
                          <table cellpadding="0" cellspacing="0" border="0" width="100%">
                            <tr>
                              <td style="font-size:22px;vertical-align:top;padding-right:14px;width:32px;">⏰</td>
                              <td style="vertical-align:top;">
                                <p style="margin:0 0 4px;color:#92400E;font-size:14px;font-weight:700;">
                                  Lưu ý quan trọng
                                </p>
                                <p style="margin:0;color:#B45309;font-size:13px;line-height:1.6;">
                                  Đường dẫn này chỉ có hiệu lực trong
                                  <strong style="color:#D97706;">15 phút</strong> kể từ khi email được gửi.
                                  Sau thời gian này, bạn cần thực hiện yêu cầu lại từ đầu.
                                </p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <!-- Security tips -->
                    <p style="margin:0 0 14px;color:#6B7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;">
                      Mẹo bảo mật tài khoản:
                    </p>

                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;">
                      <tr>
                        <td style="background:#F0FDF4;border-radius:10px;padding:13px 16px;">
                          <table cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="font-size:18px;vertical-align:middle;padding-right:12px;">✅</td>
                              <td style="color:#166534;font-size:13.5px;font-weight:600;vertical-align:middle;">
                                Dùng mật khẩu ít nhất 8 ký tự, bao gồm chữ hoa, số và ký tự đặc biệt
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;">
                      <tr>
                        <td style="background:#EFF6FF;border-radius:10px;padding:13px 16px;">
                          <table cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="font-size:18px;vertical-align:middle;padding-right:12px;">🔒</td>
                              <td style="color:#1E40AF;font-size:13.5px;font-weight:600;vertical-align:middle;">
                                Không dùng lại mật khẩu đã sử dụng ở các trang web khác
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
                      <tr>
                        <td style="background:#FFF7ED;border-radius:10px;padding:13px 16px;">
                          <table cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td style="font-size:18px;vertical-align:middle;padding-right:12px;">🚫</td>
                              <td style="color:#92400E;font-size:13.5px;font-weight:600;vertical-align:middle;">
                                Không chia sẻ mật khẩu với bất kỳ ai, kể cả nhân viên SmartFood
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <!-- Link fallback -->
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="background:#F9FAFB;border:1px dashed #E5E7EB;border-radius:10px;padding:16px;">
                          <p style="margin:0 0 6px;color:#6B7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">
                            Nút không hoạt động? Sao chép đường dẫn bên dưới:
                          </p>
                          <p style="margin:0;color:#1D4ED8;font-size:12px;word-break:break-all;line-height:1.5;">
                            ${resetLink}
                          </p>
                        </td>
                      </tr>
                    </table>

                    <!-- Note -->
                    <p style="margin:20px 0 0;color:#9CA3AF;font-size:13px;line-height:1.6;text-align:center;">
                      🛡️ Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.<br/>
                      Tài khoản của bạn vẫn <strong style="color:#374151;">hoàn toàn an toàn</strong>.
                    </p>

                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#1F2937;border-radius:0 0 20px 20px;padding:32px 40px;text-align:center;">
              <p style="margin:0 0 6px;color:#ffffff;font-size:17px;font-weight:800;letter-spacing:0.5px;">
                🌿 SMARTFOOD
              </p>
              <p style="margin:0 0 16px;color:#9CA3AF;font-size:13px;line-height:1.6;">
                Thực phẩm sạch — Sống khỏe mỗi ngày<br/>
                📍 129 Cửa Đại, Hội An, Quảng Nam
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="border-top:1px solid #374151;padding:16px 0 0;"></td></tr>
              </table>
              <p style="margin:0;color:#6B7280;font-size:11px;line-height:1.7;">
                Email này được gửi tự động từ hệ thống SmartFood.<br/>
                Vui lòng không trả lời email này.<br/>
                © 2025 SmartFood. All rights reserved.
              </p>
            </td>
          </tr>

          <tr><td style="height:32px;"></td></tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
`

    await sendMail(existUser.email, customSubject, htmlContent)

    return { sent: true }
  } catch (error) {
    throw error
  }
}

const resetPassword = async (reqBody) => {
  try {
    const existUser = await userModel.findOneByEmail(reqBody.email)
    if (!existUser) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy tài khoản!')

    if (!existUser.resetPasswordToken || existUser.resetPasswordToken !== reqBody.token) {
      throw new ApiError(StatusCodes.NOT_ACCEPTABLE, 'Mã đặt lại mật khẩu không hợp lệ!')
    }

    if (!existUser.resetPasswordExpiresAt || Number(existUser.resetPasswordExpiresAt) < Date.now()) {
      throw new ApiError(StatusCodes.GONE, 'Mã đặt lại mật khẩu đã hết hạn!')
    }

    await userModel.update(existUser._id, {
      password: bcryptjs.hashSync(reqBody.newPassword, 8),
      resetPasswordToken: null,
      resetPasswordExpiresAt: null,
      updatedAt: Date.now()
    })

    return { reset: true }
  } catch (error) {
    throw error
  }
}


const update = async (userId, reqBody, file) => {
  try {
    const existUser = await userModel.findOneById(userId)
    if (!existUser) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy tài khoản!')
    if (!existUser.isActive) throw new ApiError(StatusCodes.NOT_ACCEPTABLE, 'Tài khoản chưa được kích hoạt!')

    let updatedUser = {}

    if (reqBody.current_password && reqBody.new_password) {
      // Nếu tài khoản social chưa có mật khẩu, không thể dùng current_password để check
      if (!existUser.password) {
        throw new ApiError(StatusCodes.NOT_ACCEPTABLE, 'Tài khoản của bạn chưa thiết lập mật khẩu. Vui lòng sử dụng chức năng "Quên mật khẩu" để tạo mật khẩu lần đầu.')
      }

      if (!bcryptjs.compareSync(reqBody.current_password, existUser.password)) {
        throw new ApiError(StatusCodes.NOT_ACCEPTABLE, 'Mật khẩu hiện tại không đúng!')
      }

      updatedUser = await userModel.update(existUser._id, {
        password: bcryptjs.hashSync(reqBody.new_password, 8),
        updatedAt: Date.now()
      })
    } else {
      const updateData = {
        ...reqBody,
        updatedAt: Date.now()
      }
      delete updateData.current_password
      delete updateData.new_password

      if (file) {
        const uploadResult = await CloudinaryProvider.streamUpload(file.buffer, 'smartfood-users', file.mimetype)
        updateData.avatar = uploadResult.secure_url
      }

      updatedUser = await userModel.update(existUser._id, updateData)
    }

    return pickUser(updatedUser)
  } catch (error) {
    throw error
  }
}

// Social Auth — Callback sau khi OAuth provider xác thực thành công
// socialProfile: { socialId, provider, email, displayName, avatar }
const socialAuthCallback = async (socialProfile) => {
  try {
    const { socialId, provider, email, displayName, avatar } = socialProfile

    if (!socialId || !provider) {
      throw new ApiError(StatusCodes.BAD_REQUEST, 'Thông tin xác thực xã hội không hợp lệ!')
    }

    // Upsert: tìm hoặc tạo mới user từ social profile
    const user = await userModel.upsertSocialUser({ email, displayName, avatar, provider, socialId })

    if (!user) {
      throw new ApiError(StatusCodes.INTERNAL_SERVER_ERROR, 'Không thể xử lý tài khoản xã hội!')
    }

    const userInfo = {
      _id: user._id.toString(),
      email: user.email
    }

    const accessToken = await jwtProvider.generateToken(
      userInfo,
      env.ACCESS_TOKEN_PRIVATE_KEY,
      env.ACCESS_TOKEN_LIFE || '1d'
    )

    const refreshToken = await jwtProvider.generateToken(
      userInfo,
      env.REFRESH_TOKEN_PRIVATE_KEY,
      env.REFRESH_TOKEN_LIFE || '14d'
    )

    return {
      _id: user._id.toString(),
      accessToken,
      refreshToken,
      ...pickUser(user)
    }
  } catch (error) {
    throw error
  }
}

// ──────────────────────────────────────────────────────────────
// Verify OAuth — FE gọi sau khi landing trên trang login-success
// để xác nhận user đã được tạo/đăng nhập thành công
// ──────────────────────────────────────────────────────────────
const verifyOAuth = async (reqBody) => {
  try {
    const { userId } = reqBody

    if (!userId) throw new ApiError(StatusCodes.BAD_REQUEST, 'Thiếu userId!')

    const user = await userModel.findOneById(userId)
    if (!user) throw new ApiError(StatusCodes.NOT_FOUND, 'Không tìm thấy tài khoản!')
    if (user._destroy) throw new ApiError(StatusCodes.FORBIDDEN, 'Tài khoản đã bị xóa!')

    return pickUser(user)
  } catch (error) {
    throw error
  }
}

export const userService = {
  createNew,
  verifyAccount,
  login,
  refreshToken,
  update,
  forgotPassword,
  resetPassword,
  socialAuthCallback,
  verifyOAuth
}
