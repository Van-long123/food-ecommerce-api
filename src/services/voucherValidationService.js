import { StatusCodes } from "http-status-codes";
import { voucherModel } from "~/models/voucherModel";
import { voucherUsageModel } from "~/models/voucherUsageModel";
import ApiError from "~/utils/ApiError";

/**
 * Chuẩn hóa dữ liệu danh sách sản phẩm gửi lên để validate voucher.
 * Đảm bảo các trường dữ liệu là đúng kiểu và giá trị hợp lệ. */
const normalizeValidationItems = (items = []) => {
  return items
    .map((item) => {
      const productId = String(item.productId || item.id || "").trim();
      if (!productId) return null;

      const quantity = Math.max(1, Number(item.quantity || 1));
      const price = Math.max(0, Number(item.price || 0));
      const lineTotal = price * quantity;

      return {
        productId,
        categoryId: item.categoryId ? String(item.categoryId).trim() : "",
        quantity,
        price,
        lineTotal,
      };
    })
    .filter(Boolean);
};

/**
 * Kiểm tra xem một sản phẩm cụ thể có nằm trong phạm vi áp dụng của voucher hay không.
 * Hỗ trợ áp dụng cho: Tất cả, Danh mục cụ thể, hoặc Sản phẩm cụ thể. */
const isItemInVoucherScope = (voucher, item) => {
  if (voucher.applyFor === voucherModel.VOUCHER_APPLY_FOR.ALL) return true;

  const applyForIdsStr = voucher.applyForIds?.map((id) => String(id)) || [];

  if (voucher.applyFor === voucherModel.VOUCHER_APPLY_FOR.CATEGORY) {
    return (
      Boolean(item.categoryId) && applyForIdsStr.includes(item.categoryId)
    );
  }

  if (voucher.applyFor === voucherModel.VOUCHER_APPLY_FOR.PRODUCT) {
    return applyForIdsStr.includes(item.productId);
  }

  return true;
};

/**
 * Phân bổ số tiền giảm giá cho từng sản phẩm đủ điều kiện (Fair-Share).
 * Sử dụng thuật toán phân bổ phần dư theo thứ tự ưu tiên (phần thập phân lớn nhất)
 * để đảm bảo tổng số tiền giảm giá sau khi làm tròn khớp chính xác với discountAmount. */
const allocateDiscountBreakdown = (eligibleItems, discountAmount) => {
  const totalEligibleAmount = eligibleItems.reduce(
    (sum, item) => sum + item.lineTotal,
    0,
  );
  if (
    !eligibleItems.length ||
    discountAmount <= 0 ||
    totalEligibleAmount <= 0
  ) {
    return {};
  }

  // Bước 1: Tính toán phần giảm giá "lý thuyết" cho từng item
  const rawShares = eligibleItems.map((item) => {
    const exactShare = (discountAmount * item.lineTotal) / totalEligibleAmount;
    return {
      productId: item.productId,
      exactShare,
      floorShare: Math.floor(exactShare), // Lấy phần nguyên
      fraction: exactShare - Math.floor(exactShare), // Lấy phần thập phân dư ra
    };
  });

  // Bước 2: Tính tổng số tiền đã phân bổ xong (phần nguyên)
  let allocatedTotal = rawShares.reduce(
    (sum, item) => sum + item.floorShare,
    0,
  );
  // Bước 3: Tính số tiền còn dư chưa phân bổ hết do làm tròn xuống (remainder)
  let remainder = Math.max(0, Math.round(discountAmount) - allocatedTotal);

  // Bước 4: Ưu tiên cộng 1đ cho những item có phần thập phân (fraction) lớn nhất cho đến khi hết remainder
  rawShares
    .slice()
    .sort((a, b) => b.fraction - a.fraction || b.exactShare - a.exactShare)
    .forEach((item) => {
      if (remainder <= 0) return;
      item.floorShare += 1;
      remainder -= 1;
    });

  // Trả về object dạng { [productId]: số_tiền_giảm_giá }
  return rawShares.reduce((result, item) => {
    result[item.productId] = item.floorShare;
    return result;
  }, {});
};

/**
 * Hàm validate voucher chính dùng cho quy trình thanh toán (Checkout).
 * Kiểm tra: Tồn tại, Thời hạn, Trạng thái, Lượt dùng (tổng/cá nhân), Giá trị đơn tối thiểu, Phạm vi áp dụng. */
const validateVoucherForCheckout = async (
  { code, orderValue, items = [], shippingFee = 0 },
  accountId = null,
) => {
  if (!code)
    throw new ApiError(StatusCodes.BAD_REQUEST, "Vui lòng nhập mã giảm giá!");

  // 1. Tìm voucher trong DB
  const voucher = await voucherModel.findOneByCode(code);
  if (!voucher) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Mã giảm giá không tồn tại!");
  }

  // 2. Kiểm tra thời hạn và trạng thái kích hoạt
  const now = new Date();
  if (
    voucher.status !== voucherModel.VOUCHER_STATUSES.ACTIVE ||
    now < new Date(voucher.startDate) ||
    now > new Date(voucher.endDate)
  ) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Mã giảm giá đã hết hạn hoặc chưa có hiệu lực!",
    );
  }

  // 3. Kiểm tra tổng lượt sử dụng hệ thống
  if (voucher.usedCount >= voucher.quantity) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Mã giảm giá đã hết lượt sử dụng!",
    );
  }

  // 4. Kiểm tra giới hạn sử dụng của từng User (nếu đã đăng nhập)
  if (accountId) {
    const usageCount = await voucherUsageModel.countUsageByUser(
      voucher._id,
      accountId,
    );
    if (usageCount >= voucher.usageLimitPerUser) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "Bạn đã sử dụng hết lượt mã giảm giá này!",
      );
    }
  }

  // 5. Tính toán giá trị các sản phẩm đủ điều kiện áp dụng mã
  const normalizedItems = normalizeValidationItems(items);
  const eligibleItems = normalizedItems.filter((item) =>
    isItemInVoucherScope(voucher, item),
  );
  const eligibleSubtotal = eligibleItems.reduce(
    (sum, item) => sum + item.lineTotal,
    0,
  );

  const orderSubtotal = Number(orderValue || 0);
  // scopedSubtotal: Tổng tiền của những mặt hàng "thỏa mãn" điều kiện voucher
  const scopedSubtotal =
    voucher.applyFor === voucherModel.VOUCHER_APPLY_FOR.ALL
      ? orderSubtotal
      : eligibleSubtotal;

  // Base để tính % giảm giá: Nếu áp dụng cho 1 số SP cụ thể thì chỉ tính % trên tổng tiền các SP đó
  const discountBaseAmount =
    scopedSubtotal > 0 ? scopedSubtotal : orderSubtotal;

  // 6. Kiểm tra xem giỏ hàng có sản phẩm nào thuộc diện áp dụng không
  if (
    normalizedItems.length > 0 &&
    voucher.applyFor !== voucherModel.VOUCHER_APPLY_FOR.ALL &&
    eligibleItems.length === 0
  ) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Mã giảm giá không áp dụng cho các sản phẩm trong giỏ hàng!",
    );
  }

  // 7. Kiểm tra điều kiện giá trị đơn hàng tối thiểu
  if (scopedSubtotal < voucher.minOrderValue) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      `Đơn hàng tối thiểu để áp dụng mã này là ${voucher.minOrderValue.toLocaleString("vi-VN")}đ!`,
    );
  }

  // 8. Tính toán số tiền giảm giá dựa trên loại Voucher
  let discountAmount = 0;
  let discountBreakdown = {};

  if (voucher.type === voucherModel.VOUCHER_TYPES.FREESHIP) {
    // Freeship: giảm trực tiếp vào phí ship, không liên quan tiền hàng
    // Số tiền giảm = min(discountValue, phí ship thực tế)
    discountAmount = Math.min(voucher.discountValue, Number(shippingFee));
    // discountBreakdown rỗng vì không phân bổ giảm giá cho sản phẩm nào
    // discountBreakdown = {}
  } else {
    // Các loại voucher còn lại (money, percent, product): giảm vào tiền hàng
    if (voucher.type === voucherModel.VOUCHER_TYPES.MONEY) {
      discountAmount = voucher.discountValue;
    } else if (voucher.type === voucherModel.VOUCHER_TYPES.PERCENT) {
      discountAmount = (discountBaseAmount * voucher.discountValue) / 100;
      // Khống chế mức giảm tối đa nếu có (Max Discount)
      if (voucher.maxDiscountAmount != null) {
        discountAmount = Math.min(discountAmount, voucher.maxDiscountAmount);
      }
    } else if (voucher.type === voucherModel.VOUCHER_TYPES.PRODUCT) {
      discountAmount = voucher.discountValue;
    }

    // Khống chế: số tiền giảm không được vượt quá tổng tiền hàng thực tế
    discountAmount = Math.min(Math.round(discountAmount), discountBaseAmount);

    // 9. Phân bổ chi tiết số tiền giảm cho từng sản phẩm (phục vụ lưu trữ order_items)
    discountBreakdown = allocateDiscountBreakdown(
      eligibleItems.length > 0 ? eligibleItems : normalizedItems,
      discountAmount,
    );
  }

  return {
    isValid: true,
    discountAmount,
    eligibleSubtotal: scopedSubtotal,
    discountBreakdown,
    voucher: {
      _id: voucher._id,
      code: voucher.code,
      name: voucher.name,
      type: voucher.type,
      discountValue: voucher.discountValue,
      maxDiscountAmount: voucher.maxDiscountAmount,
      minOrderValue: voucher.minOrderValue,
      applyFor: voucher.applyFor,
      applyForIds: voucher.applyForIds || [],
      quantity: voucher.quantity,
    },
  };
};

export const voucherValidationService = {
  normalizeValidationItems,
  validateVoucherForCheckout,
};
