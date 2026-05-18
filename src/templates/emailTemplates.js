import { WEBSITE_DOMAIN } from "~/utils/constants";
import { formatCurrency, formatDate } from "~/utils/formatters";

export const getCodOrderTemplate = (orderData) => {
  const {
    orderId,
    customerName,
    customerPhone,
    customerAddress,
    items,
    shippingFee,
    discountVoucher,
    totalPay,
    orderDate,
  } = orderData;

  const itemsHtml = items
    .map(
      (item) => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.title}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(item.price)}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(item.totalPrice)}</td>
    </tr>
  `
    )
    .join('');

  const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #4CAF50; padding: 20px; text-align: center; color: white;">
        <h1 style="margin: 0; font-size: 24px;">SmartFood</h1>
        <p style="margin: 5px 0 0 0; font-size: 16px;">Cảm ơn bạn đã đặt hàng!</p>
      </div>

      <div style="padding: 20px;">
        <p style="font-size: 16px; margin-top: 0;">Xin chào <strong>${customerName}</strong>,</p>
        <p>Đơn hàng của bạn đã được ghi nhận trên hệ thống và đang chờ xác nhận.</p>

        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px solid #eee;">
          <h2 style="font-size: 18px; margin-top: 0; color: #222; text-align: center;">Mã đơn hàng: <span style="color: #4CAF50;">${orderId}</span></h2>
          <table style="width: 100%; font-size: 14px;">
            <tr>
              <td style="padding: 4px 0;"><strong>Ngày đặt:</strong></td>
              <td style="padding: 4px 0; text-align: right;">${formatDate(orderDate || new Date())}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0;"><strong>Hình thức thanh toán:</strong></td>
              <td style="padding: 4px 0; text-align: right;">Thanh toán khi nhận hàng (COD)</td>
            </tr>
            <tr>
              <td style="padding: 4px 0;"><strong>Trạng thái thanh toán:</strong></td>
              <td style="padding: 4px 0; text-align: right;"><span style="color: #e67e22;">Chưa thanh toán</span></td>
            </tr>
            <tr>
              <td style="padding: 4px 0;"><strong>Trạng thái đơn hàng:</strong></td>
              <td style="padding: 4px 0; text-align: right; color: #2980b9;">Đang chờ xác nhận</td>
            </tr>
          </table>
        </div>

        <div style="margin-bottom: 20px;">
          <h3 style="font-size: 16px; border-bottom: 2px solid #4CAF50; padding-bottom: 5px; color: #4CAF50;">Thông tin người nhận</h3>
          <p style="margin: 5px 0;"><strong>Tên:</strong> ${customerName}</p>
          <p style="margin: 5px 0;"><strong>Số điện thoại:</strong> ${customerPhone}</p>
          <p style="margin: 5px 0;"><strong>Địa chỉ:</strong> ${customerAddress}</p>
        </div>

        <div style="margin-bottom: 20px;">
          <h3 style="font-size: 16px; border-bottom: 2px solid #4CAF50; padding-bottom: 5px; color: #4CAF50;">Chi tiết đơn hàng</h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <thead>
              <tr style="background-color: #f5f5f5;">
                <th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">Tên món</th>
                <th style="padding: 10px; text-align: right; border-bottom: 1px solid #ddd;">Đơn giá</th>
                <th style="padding: 10px; text-align: center; border-bottom: 1px solid #ddd;">SL</th>
                <th style="padding: 10px; text-align: right; border-bottom: 1px solid #ddd;">Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="3" style="padding: 10px; text-align: right; border-bottom: 1px solid #eee;"><strong>Tạm tính:</strong></td>
                <td style="padding: 10px; text-align: right; border-bottom: 1px solid #eee;">${formatCurrency(subtotal)}</td>
              </tr>
              <tr>
                <td colspan="3" style="padding: 10px; text-align: right; border-bottom: 1px solid #eee;"><strong>Phí giao hàng:</strong></td>
                <td style="padding: 10px; text-align: right; border-bottom: 1px solid #eee;">${formatCurrency(shippingFee)}</td>
              </tr>
              ${discountVoucher > 0 ? `
              <tr>
                <td colspan="3" style="padding: 10px; text-align: right; border-bottom: 1px solid #eee;"><strong>Voucher/Giảm giá:</strong></td>
                <td style="padding: 10px; text-align: right; border-bottom: 1px solid #eee; color: #e74c3c;">-${formatCurrency(discountVoucher)}</td>
              </tr>
              ` : ''}
              <tr>
                <td colspan="3" style="padding: 12px 10px; text-align: right; font-size: 16px;"><strong>Tổng thanh toán:</strong></td>
                <td style="padding: 12px 10px; text-align: right; font-size: 16px; color: #e74c3c;"><strong>${formatCurrency(totalPay)}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div style="background-color: #fff3cd; color: #856404; padding: 15px; border-radius: 6px; border: 1px solid #ffeeba; text-align: center; margin-top: 20px;">
          <p style="margin: 0; font-size: 15px;"><strong>Lưu ý quan trọng:</strong> Vui lòng chuẩn bị sẵn số tiền mặt là <strong style="color: #e74c3c; font-size: 16px;">${formatCurrency(totalPay)}</strong> để thanh toán cho nhân viên giao hàng.</p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <p style="font-size: 14px; color: #666; margin-bottom: 15px;">Bạn có thể theo dõi tình trạng đơn hàng của mình tại đây:</p>
          <a href="${WEBSITE_DOMAIN}/order/${orderId}" 
             style="display: inline-block; background-color: #f47f20; color: white; padding: 12px 25px; text-decoration: none; font-weight: bold; border-radius: 999px; box-shadow: 0 4px 6px rgba(244, 127, 32, 0.2);">
            Theo dõi đơn hàng
          </a>
        </div>
        
      </div>
      
      <div style="background-color: #f5f5f5; text-align: center; padding: 20px; font-size: 13px; color: #777;">
        <p style="margin: 0 0 5px 0;"><strong>SmartFood</strong> - Trải nghiệm ẩm thực tuyệt vời</p>
        <p style="margin: 0;">Email này được gửi tự động từ hệ thống. Vui lòng không trả lời email này.</p>
      </div>
    </div>
  `;
};
export const getPayOSOrderTemplate = (orderData) => {
  const {
    orderId,
    customerName,
    customerPhone,
    customerAddress,
    items,
    shippingFee,
    discountVoucher,
    totalPay,
    orderDate,
    transactionId,
  } = orderData;

  const itemsHtml = items
    .map(
      (item) => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.title}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(item.price)}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(item.totalPrice)}</td>
    </tr>
  `
    )
    .join('');

  const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #0073e6, #0052a3); padding: 20px; text-align: center; color: white;">
        <h1 style="margin: 0; font-size: 24px;">SmartFood</h1>
        <p style="margin: 5px 0 0 0; font-size: 16px;">🎉 Thanh toán VietQR thành công!</p>
      </div>

      <div style="padding: 20px;">
        <p style="font-size: 16px; margin-top: 0;">Xin chào <strong>${customerName}</strong>,</p>
        <p>Đơn hàng của bạn đã được <strong style="color: #16a34a;">xác nhận và thanh toán thành công</strong> qua VietQR (PayOS).</p>

        <div style="background-color: #f0fdf4; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px solid #bbf7d0;">
          <h2 style="font-size: 18px; margin-top: 0; color: #222; text-align: center;">Mã đơn hàng: <span style="color: #16a34a;">${orderId}</span></h2>
          <table style="width: 100%; font-size: 14px;">
            <tr>
              <td style="padding: 4px 0;"><strong>Ngày đặt:</strong></td>
              <td style="padding: 4px 0; text-align: right;">${formatDate(orderDate || new Date())}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0;"><strong>Hình thức thanh toán:</strong></td>
              <td style="padding: 4px 0; text-align: right;">VietQR qua PayOS</td>
            </tr>
            <tr>
              <td style="padding: 4px 0;"><strong>Trạng thái thanh toán:</strong></td>
              <td style="padding: 4px 0; text-align: right;"><span style="color: #16a34a; font-weight: bold;">✅ Đã thanh toán</span></td>
            </tr>
            <tr>
              <td style="padding: 4px 0;"><strong>Trạng thái đơn hàng:</strong></td>
              <td style="padding: 4px 0; text-align: right; color: #0073e6;">Đã xác nhận</td>
            </tr>
            ${transactionId ? `
            <tr>
              <td style="padding: 4px 0;"><strong>Mã giao dịch:</strong></td>
              <td style="padding: 4px 0; text-align: right; font-family: monospace; color: #6b7280;">${transactionId}</td>
            </tr>` : ''}
          </table>
        </div>

        <div style="margin-bottom: 20px;">
          <h3 style="font-size: 16px; border-bottom: 2px solid #0073e6; padding-bottom: 5px; color: #0073e6;">Thông tin người nhận</h3>
          <p style="margin: 5px 0;"><strong>Tên:</strong> ${customerName}</p>
          <p style="margin: 5px 0;"><strong>Số điện thoại:</strong> ${customerPhone}</p>
          <p style="margin: 5px 0;"><strong>Địa chỉ:</strong> ${customerAddress}</p>
        </div>

        <div style="margin-bottom: 20px;">
          <h3 style="font-size: 16px; border-bottom: 2px solid #0073e6; padding-bottom: 5px; color: #0073e6;">Chi tiết đơn hàng</h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <thead>
              <tr style="background-color: #f5f5f5;">
                <th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">Tên món</th>
                <th style="padding: 10px; text-align: right; border-bottom: 1px solid #ddd;">Đơn giá</th>
                <th style="padding: 10px; text-align: center; border-bottom: 1px solid #ddd;">SL</th>
                <th style="padding: 10px; text-align: right; border-bottom: 1px solid #ddd;">Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="3" style="padding: 10px; text-align: right; border-bottom: 1px solid #eee;"><strong>Tạm tính:</strong></td>
                <td style="padding: 10px; text-align: right; border-bottom: 1px solid #eee;">${formatCurrency(subtotal)}</td>
              </tr>
              <tr>
                <td colspan="3" style="padding: 10px; text-align: right; border-bottom: 1px solid #eee;"><strong>Phí giao hàng:</strong></td>
                <td style="padding: 10px; text-align: right; border-bottom: 1px solid #eee;">${formatCurrency(shippingFee)}</td>
              </tr>
              ${discountVoucher > 0 ? `
              <tr>
                <td colspan="3" style="padding: 10px; text-align: right; border-bottom: 1px solid #eee;"><strong>Voucher/Giảm giá:</strong></td>
                <td style="padding: 10px; text-align: right; border-bottom: 1px solid #eee; color: #e74c3c;">-${formatCurrency(discountVoucher)}</td>
              </tr>
              ` : ''}
              <tr>
                <td colspan="3" style="padding: 12px 10px; text-align: right; font-size: 16px;"><strong>Tổng thanh toán:</strong></td>
                <td style="padding: 12px 10px; text-align: right; font-size: 16px; color: #16a34a;"><strong>${formatCurrency(totalPay)}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <p style="font-size: 14px; color: #666; margin-bottom: 15px;">Bạn có thể theo dõi tình trạng đơn hàng của mình tại đây:</p>
          <a href="${WEBSITE_DOMAIN}/order/${orderId}" 
             style="display: inline-block; background-color: #0073e6; color: white; padding: 12px 25px; text-decoration: none; font-weight: bold; border-radius: 999px; box-shadow: 0 4px 6px rgba(0, 115, 230, 0.2);">
            Theo dõi đơn hàng
          </a>
        </div>
        
      </div>
      
      <div style="background-color: #f5f5f5; text-align: center; padding: 20px; font-size: 13px; color: #777;">
        <p style="margin: 0 0 5px 0;"><strong>SmartFood</strong> - Trải nghiệm ẩm thực tuyệt vời</p>
        <p style="margin: 0;">Email này được gửi tự động từ hệ thống. Vui lòng không trả lời email này.</p>
      </div>
    </div>
  `;
};
