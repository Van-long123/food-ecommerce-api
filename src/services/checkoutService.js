import { StatusCodes } from "http-status-codes";
import ApiError from "~/utils/ApiError";
import { addressModel } from "~/models/addressModel";
import { ghnService } from "~/services/ghnService";
import { productModel } from "~/models/productModel";
import { orderModel } from "~/models/orderModel";
import { orderItemModel } from "~/models/orderItemModel";
import { paymentModel } from "~/models/paymentModel";
import { voucherUsageModel } from "~/models/voucherUsageModel";
import { orderService } from "~/services/orderService";
import { cartService } from "~/services/cartService";
import { voucherValidationService } from "~/services/voucherValidationService";
import { GET_CLIENT } from "~/config/mongodb";
import { sendMail } from "~/utils/sendMail";
import { getCodOrderTemplate } from "~/templates/emailTemplates";
import { userModel } from "~/models/userModel";

/**
 * Tính phí vận chuyển cho địa chỉ được chọn.
 * 1. Tìm address theo addressId và xác minh thuộc về userId
 * 2. Gọi GHN available-services để lấy service Nhanh
 * 3. Gọi GHN fee API với district_id và ward_code của địa chỉ
 */
const getShippingFee = async (userId, addressId, products = []) => {
  // 1. Tìm và xác minh địa chỉ
  const address = await addressModel.findOneById(addressId);

  if (!address || address.deleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Không tìm thấy địa chỉ");
  }

  if (address.userId.toString() !== userId.toString()) {
    throw new ApiError(StatusCodes.FORBIDDEN, "Địa chỉ không thuộc về bạn");
  }

  // Lấy thêm thông tin unit từ database để tính khối lượng chuẩn xác
  const productIds = products.map((p) => p._id);
  const dbProducts =
    productIds.length > 0 ? await productModel.findManyByIds(productIds) : [];

  const enrichedProducts = products.map((p) => {
    const dbProduct = dbProducts.find(
      (dp) => dp._id.toString() === p._id.toString(),
    );
    return {
      ...p,
      unit: dbProduct?.unit || "g",
    };
  });

  // 2. Gọi GHN để tính phí, kèm theo sản phẩm trong giỏ hàng
  const feeResult = await ghnService.getShippingFee({
    toDistrictId: address.district_id,
    toWardCode: address.ward_code,
    products: enrichedProducts, // truyền xuống để GHN tính chính xác hơn
  });

  return {
    shippingFee: feeResult.total,
    isFallback: feeResult.isFallback,
    address: {
      _id: address._id,
      username: address.username,
      phone: address.phone,
      address: address.address,
      ward: address.ward,
      district: address.district,
      province: address.province,
      district_id: address.district_id,
      ward_code: address.ward_code,
    },
  };
};

const createCodCheckout = async (userId, payload) => {
  const {
    addressId,
    products = [],
    voucherCode = null,
    note = "",
    shippingFee = 0,
  } = payload || {};

  if (!Array.isArray(products) || products.length === 0) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Danh sách sản phẩm trống");
  }

  const address = await addressModel.findOneById(addressId);
  if (!address || address.deleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Không tìm thấy địa chỉ");
  }

  if (address.userId.toString() !== userId.toString()) {
    throw new ApiError(StatusCodes.FORBIDDEN, "Địa chỉ không thuộc về bạn");
  }

  const normalizedItems = products
    .map((item) => ({
      productId: String(item.productId || item.id || "").trim(),
      quantity: Math.max(1, Number(item.quantity || 0)),
    }))
    .filter((item) => item.productId);

  if (!normalizedItems.length) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Danh sách sản phẩm không hợp lệ",
    );
  }

  // 2. Kiểm tra tồn kho thời gian thực trước khi chốt đơn
  const stockValidation =
    await orderService.validateStockBeforeCheckout(normalizedItems);
  if (
    stockValidation.outOfStock.length > 0 ||
    stockValidation.clamped.length > 0
  ) {
    const outNames = stockValidation.outOfStock
      .map((item) => item.name)
      .filter(Boolean);
    const clampNames = stockValidation.clamped
      .map((item) => item.name)
      .filter(Boolean);
    const names = [...outNames, ...clampNames]
      .map((name) => `"${name}"`)
      .join(", ");
    throw new ApiError(
      StatusCodes.CONFLICT,
      names
        ? `Sản phẩm ${names} không đủ tồn kho.`
        : "Sản phẩm không đủ tồn kho.",
    );
  }

  const productIds = normalizedItems.map((item) => item.productId);
  const dbProducts = await productModel.findManyByIds(productIds);
  if (dbProducts.length !== productIds.length) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Danh sách sản phẩm không hợp lệ",
    );
  }

  const productMap = new Map(
    dbProducts.map((product) => [product._id.toString(), product]),
  );

  const orderItems = normalizedItems
    .map((item) => {
      const product = productMap.get(item.productId);
      if (!product) return null;

      const price = Math.max(0, Number(product.price || 0));
      const totalPrice = price * item.quantity;

      return {
        orderId: null,
        productId: item.productId,
        title: product.title,
        thumbnail: product.thumbnail || "",
        quantity: item.quantity,
        price,
        totalPrice,
        categoryId: product.primary_category_id
          ? String(product.primary_category_id)
          : "",
      };
    })
    .filter(Boolean);

  // 3. Tính toán tổng tiền và áp dụng mã giảm giá (nếu có)
  const subtotal = orderItems.reduce((sum, item) => sum + item.totalPrice, 0);

  const voucherResult = voucherCode
    ? await voucherValidationService.validateVoucherForCheckout(
        {
          code: voucherCode,
          orderValue: subtotal,
          items: orderItems.map((item) => ({
            productId: item.productId,
            categoryId: item.categoryId,
            quantity: item.quantity,
            price: item.price,
          })),
        },
        userId,
      )
    : null;

  const discountVoucher = voucherResult?.discountAmount || 0;
  const totalPay = Math.max(
    0,
    subtotal - discountVoucher + Number(shippingFee || 0),
  );

  // 4. Bắt đầu Giao dịch (Transaction) để đảm bảo tính toàn vẹn dữ liệu
  const session = GET_CLIENT().startSession();
  let createdOrderId = null;
  let paymentId = null;

  try {
    await session.withTransaction(async () => {
      // 4a. Cập nhật trừ số lượng trong kho
      for (const item of orderItems) {
        const updateResult = await productModel.decreaseStockIfAvailable(
          item.productId,
          item.quantity,
          { session },
        );

        if (!updateResult || updateResult.modifiedCount === 0) {
          throw new ApiError(
            StatusCodes.CONFLICT,
            `Sản phẩm "${item.title}" không đủ tồn kho.`,
          );
        }
      }

      // 4b. Tạo bản ghi đơn hàng (Order)
      const orderPayload = {
        userId,
        userInfo: {
          fullname: address.username,
          phone: address.phone,
          address: address.address,
          ward: address.ward,
          district: address.district,
          province: address.province,
          note: note || "",
        },
        voucherCode: voucherCode || null,
        discountVoucher,
        shippingFee: Number(shippingFee || 0),
        totalPrice: totalPay,
        status: "pending",
      };

      const orderResult = await orderModel.createNew(orderPayload, { session });
      createdOrderId = orderResult.insertedId.toString();

      // 4c. Tạo chi tiết đơn hàng (Order Items)
      const orderItemsWithOrderId = orderItems.map((item) => ({
        orderId: createdOrderId,
        productId: item.productId,
        title: item.title,
        thumbnail: item.thumbnail,
        quantity: item.quantity,
        price: item.price,
        totalPrice: item.totalPrice,
      }));

      await orderItemModel.createMany(orderItemsWithOrderId, { session });

      // 4d. Ghi nhận sử dụng Voucher
      if (voucherResult?.voucher?._id) {
        await voucherUsageModel.recordUsage(
          {
            voucherId: voucherResult.voucher._id,
            userId,
            orderId: createdOrderId,
          },
          {
            session,
            maxUsage: voucherResult.voucher.quantity,
          },
        );
      }

      // 4e. Tạo bản ghi thanh toán (Payment)
      const paymentResult = await paymentModel.createNew(
        {
          orderId: createdOrderId,
          userId,
          paymentMethod: "COD",
          amount: totalPay,
          status: "pending",
        },
        { session },
      );

      paymentId = paymentResult.insertedId.toString();
      // throw new Error("TEST_ROLLBACK: Lỗi giả lập ở bước cuối cùng");
    });

    // 5. Sau khi thanh toán thành công, xóa các sản phẩm này khỏi giỏ hàng
    const productIdsToRemove = normalizedItems.map((item) => item.productId);
    await cartService.removeItems(userId, productIdsToRemove);

    // 6. Gửi email thông báo đơn hàng (Bất đồng bộ)
    try {
      userModel.findOneById(userId).then(user => {
        if (user && user.email) {
          const emailHtml = getCodOrderTemplate({
            orderId: createdOrderId,
            customerName: address.username,
            customerPhone: address.phone,
            customerAddress: `${address.address}, ${address.ward}, ${address.district}, ${address.province}`,
            items: orderItems,
            shippingFee: Number(shippingFee || 0),
            discountVoucher,
            totalPay,
            orderDate: new Date(),
          });
          
          sendMail(
            user.email,
            `Xác nhận đơn hàng #${createdOrderId} - SmartFood`,
            emailHtml
          ).catch(err => console.error("Lỗi gửi email xác nhận đơn hàng:", err));
        }
      }).catch(err => console.error("Lỗi lấy thông tin user để gửi email:", err));
    } catch (error) {
      console.error("Lỗi không mong muốn trong quá trình chuẩn bị gửi email:", error);
    }

    return {
      orderId: createdOrderId,
      paymentId,
      totalPay,
      discountVoucher,
    };
  } finally {
    await session.endSession();
  }
};

export const checkoutService = {
  getShippingFee,
  createCodCheckout,
};
