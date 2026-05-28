import { StatusCodes } from "http-status-codes";
import ApiError from "~/utils/ApiError";
import { ObjectId } from "mongodb";
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
import { GET_CLIENT, GET_DB } from "~/config/mongodb";
import { sendMail } from "~/utils/sendMail";
import {
  getCodOrderTemplate,
  getPayOSOrderTemplate,
} from "~/templates/emailTemplates";
import { userModel } from "~/models/userModel";
import { env } from "~/config/environment";
import { isValidData } from "~/utils/payosUtils";
import {
  createPayOSPaymentLink,
  getPayOSExpiredAt,
} from "~/services/payosService";

/**
 * Tính phí vận chuyển cho địa chỉ được chọn.
 * 1. Tìm address theo addressId và xác minh thuộc về userId
 * 2. Gọi GHN available-services để lấy service Nhanh
 * 3. Gọi GHN fee API với district_id và ward_code của địa chỉ */
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
          shippingFee: Number(shippingFee || 0),
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

  // Tạo orderCode ngẫu nhiên 9 chữ số
  const orderCode = Number(String(Date.now()).slice(-9));

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
        orderCode,
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
      userModel
        .findOneById(userId)
        .then((user) => {
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
              emailHtml,
            ).catch((err) =>
              console.error("Lỗi gửi email xác nhận đơn hàng:", err),
            );
          }
        })
        .catch((err) =>
          console.error("Lỗi lấy thông tin user để gửi email:", err),
        );
    } catch (error) {
      console.error(
        "Lỗi không mong muốn trong quá trình chuẩn bị gửi email:",
        error,
      );
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

/**
 * Tạo đơn thanh toán PayOS (VietQR).
 * Logic giống 100% createCodCheckout, nhưng:
 *  - Gọi PayOS API để lấy checkoutUrl
 *  - Lưu paymentUrl vào bản ghi payment
 *  - Trả về { checkoutUrl } để FE redirect */
const createPayOSCheckout = async (userId, payload) => {
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

  // Kiểm tra tồn kho thời gian thực
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

  const subtotal = orderItems.reduce((sum, item) => sum + item.totalPrice, 0);

  const voucherResult = voucherCode
    ? await voucherValidationService.validateVoucherForCheckout(
        {
          code: voucherCode,
          orderValue: subtotal,
          shippingFee: Number(shippingFee || 0),
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

  // Tạo orderCode ngẫu nhiên 9 chữ số (PayOS yêu cầu Number)
  const orderCode = Number(String(Date.now()).slice(-9));

  // Bắt đầu Transaction
  const session = GET_CLIENT().startSession();
  let createdOrderId = null;

  try {
    await session.withTransaction(async () => {
      // Trừ kho
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

      // Tạo đơn hàng với orderCode
      const orderPayload = {
        userId,
        orderCode,
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

      // Tạo order items
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

      // Ghi nhận voucher
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

      // Tạo bản ghi thanh toán PayOS (status: pending)
      await paymentModel.createNew(
        {
          orderId: createdOrderId,
          userId,
          paymentMethod: "PayOS",
          amount: totalPay,
          status: "pending",
        },
        { session },
      );
    });

    // Gọi PayOS API để lấy checkoutUrl
    const paymentLink = await createPayOSPaymentLink({
      orderCode,
      amount: totalPay,
      description: `SmartFood #${orderCode}`.slice(0, 25),
      cancelUrl: `${env.WEBSITE_DOMAIN_DEV || env.WEBSITE_DOMAIN_PROD}/order/${createdOrderId}`,
      returnUrl: `${env.WEBSITE_DOMAIN_DEV || env.WEBSITE_DOMAIN_PROD}/order/${createdOrderId}`,
      buyerName: address.username,
      buyerPhone: address.phone,
      expiredAt: getPayOSExpiredAt(),
    });

    // Cập nhật paymentUrl trực tiếp
    await GET_DB()
      .collection("payments")
      .updateOne(
        { orderId: new ObjectId(createdOrderId) },
        {
          $set: {
            paymentUrl: paymentLink.checkoutUrl,
            payosOrderId: String(paymentLink.paymentLinkId || orderCode),
            expiresAt: paymentLink.expiredAt
              ? new Date(paymentLink.expiredAt * 1000)
              : new Date(Date.now() + 30 * 60 * 1000),
            rawResponse: paymentLink,
            updatedAt: new Date(),
          },
        },
      );

    // Xóa sản phẩm khỏi giỏ hàng
    const productIdsToRemove = normalizedItems.map((item) => item.productId);
    await cartService.removeItems(userId, productIdsToRemove);

    return { checkoutUrl: paymentLink.checkoutUrl, orderId: createdOrderId };
  } finally {
    await session.endSession();
  }
};

/**
 * Xử lý Webhook từ PayOS khi giao dịch hoàn thành.
 * 1. Xác thực chữ ký số bằng HMAC-SHA256
 * 2. Kiểm tra giao dịch thành công (code === '00')
 * 3. Cập nhật order status → confirmed, payment status → completed
 * 4. Gửi email hóa đơn cho khách hàng */
const handlePayOSWebhook = async (body) => {
  const { data: webhookData, signature: webhookSignature } = body;

  // [BƯỚC 1] Xác thực chữ ký – bảo mật tuyệt đối
  if (!isValidData(webhookData, webhookSignature, env.PAYOS_CHECKSUM_KEY)) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "Chữ ký không hợp lệ");
  }

  const { orderCode, code } = webhookData;

  // [BƯỚC 2] Chỉ xử lý giao dịch thành công (PayOS code '00')
  if (code !== "00") {
    // Giao dịch không thành công, không làm gì thêm
    return { received: true, processed: false };
  }

  // [BƯỚC 3] Tìm đơn hàng theo orderCode
  const order = await orderModel.findByOrderCode(orderCode);
  if (!order) {
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      `Không tìm thấy đơn hàng với orderCode ${orderCode}`,
    );
  }

  const orderId = order._id.toString();

  // [BƯỚC 4] Dùng Transaction để cập nhật
  const session = GET_CLIENT().startSession();

  try {
    await session.withTransaction(async () => {
      // Cập nhật trạng thái đơn hàng → confirmed
      await orderModel.updateStatusById(orderId, "confirmed", { session });

      // Cập nhật trạng thái thanh toán → completed
      await paymentModel.updatePayOSCompleted(
        orderId,
        webhookData.reference ||
          webhookData.transactionDateTime ||
          String(Date.now()),
        webhookData,
        { session },
      );
    });

    // [BƯỚC 5] Gửi email xác nhận đơn hàng PayOS (bất đồng bộ)
    try {
      const [user, orderItems] = await Promise.all([
        userModel.findOneById(order.userId.toString()),
        orderItemModel.findByOrderId(orderId),
      ]);

      if (user?.email && order.userInfo) {
        const emailHtml = getPayOSOrderTemplate({
          orderId,
          customerName: order.userInfo.fullname,
          customerPhone: order.userInfo.phone,
          customerAddress: `${order.userInfo.address}, ${order.userInfo.ward}, ${order.userInfo.district}, ${order.userInfo.province}`,
          items: orderItems.length > 0 ? orderItems : [],
          shippingFee: order.shippingFee || 0,
          discountVoucher: order.discountVoucher || 0,
          totalPay: order.totalPrice,
          orderDate: order.createdAt,
          transactionId: webhookData.reference,
        });

        sendMail(
          user.email,
          `Xác nhận thanh toán #${orderId} - SmartFood`,
          emailHtml,
        ).catch((err) => console.error("Lỗi gửi email PayOS:", err));
      }
    } catch (emailErr) {
      console.error("Lỗi chuẩn bị email PayOS:", emailErr);
    }

    return { received: true, processed: true, orderId };
  } finally {
    await session.endSession();
  }
};

export const checkoutService = {
  getShippingFee,
  createCodCheckout,
  createPayOSCheckout,
  handlePayOSWebhook,
};
