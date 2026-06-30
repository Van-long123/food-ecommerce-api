/**
 * chatbotService.js
 * Kiến trúc: AI Agent sử dụng OpenAI Function Calling (Tool Calling)
 *
 * Luồng hoạt động (Agentic Loop):
 *   1. User gửi tin nhắn
 *   2. Gọi OpenAI lần 1 kèm danh sách Tools → AI tự quyết định gọi hàm nào
 *   3. Nếu có tool_calls → thực thi song song (Promise.all) → lấy dữ liệu DB/API
 *   4. Gọi OpenAI lần 2 kèm kết quả tool → AI tổng hợp câu trả lời tự nhiên
 *   5. Lưu lịch sử MongoDB → trả về response
 */

import OpenAI from "openai";
import axios from "axios";
import { env } from "~/config/environment";
import { GET_DB } from "~/config/mongodb";
import { chatbotMessageModel } from "~/models/chatbotMessageModel";
import { productModel } from "~/models/productModel";
import { orderModel } from "~/models/orderModel";
import { voucherModel } from "~/models/voucherModel";
import { voucherUsageModel } from "~/models/voucherUsageModel";
import ApiError from "~/utils/ApiError";
import { StatusCodes } from "http-status-codes";

import { GPT_MODEL, EMBED_MODEL } from "~/constants/aiConfig";

//  OpenAI Client
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

//  Redis Client (Embedding Cache)
import { createClient } from "redis";

let redisClient = null;

const getRedis = async () => {
  // 1. Nếu client đã tồn tại và đang mở kết nối, trả về client đó luôn
  if (redisClient && redisClient.isOpen) return redisClient;
  try {
    // 2. Nếu chưa có kết nối, khởi tạo một client mới
    redisClient = createClient({
      url: env.REDIS_URL || "redis://localhost:6379",
      RESP: 2, // Sử dụng giao thức RESP2 để tương thích tốt nhất
    });
    // 3. Đăng ký callback lắng nghe lỗi
    redisClient.on("error", (e) =>
      console.warn("[Redis] Lỗi kết nối:", e.message),
    );
    await redisClient.connect();
    console.log("[Redis] Kết nối thành công — Embedding cache đã sẵn sàng.");
  } catch (e) {
    console.warn("[Redis] Không thể kết nối, bỏ qua cache:", e.message);
    redisClient = null;
  }
  return redisClient;
};

/**
 * Tạo embedding có cache Redis.
 * - Cache HIT  → trả về vector ngay (không gọi OpenAI)
 * - Cache MISS → gọi OpenAI, lưu vào Redis TTL 24h, trả về vector
 */
const getEmbeddingCached = async (text) => {
  const cacheKey = `embed:${text.trim().toLowerCase().slice(0, 200)}`;
  try {
    const redis = await getRedis();
    if (redis) {
      const cached = await redis.get(cacheKey); // Đọc giá trị từ Redis
      if (cached) {
        console.log(`[Cache HIT] embed: "${text.slice(0, 40)}..."`);
        return JSON.parse(cached); // chuyển chuỗi JSON thành mảng Vector
      }
    }
  } catch (e) {
    console.warn("[Redis] Lỗi đọc cache:", e.message);
  }

  // Cache MISS → gọi OpenAI
  const res = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: text,
  });
  const vector = res.data[0].embedding; // Lấy mảng vector [0.1, 0.2, ...]

  try {
    const redis = await getRedis();
    if (redis) {
      // Lưu vào Redis với thời gian sống (TTL) là 24 giờ (86400 giây)
      await redis.setEx(cacheKey, 86400, JSON.stringify(vector));
      console.log(`[Cache SET] embed: "${text.slice(0, 40)}..."`);
    }
  } catch (e) {
    console.warn("[Redis] Lỗi ghi cache:", e.message);
  }

  return vector;
};

/** Loại bỏ thẻ HTML từ TinyMCE trước khi nhét vào context */
const stripHtml = (html) =>
  (html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();

/** Map trạng thái đơn hàng sang tiếng Việt */
const ORDER_STATUS_MAP = {
  pending: "Chờ xác nhận",
  confirmed: "Đã xác nhận",
  processing: "Đang xử lý",
  shipping: "Đang giao",
  delivered: "Giao thành công",
  cancelled: "Đã hủy",
  returned: "Trả hàng",
};

//  1. Khai báo Tools (JSON Schema chuẩn OpenAI)
const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_products",
      description:
        "Tìm kiếm sản phẩm thực phẩm trong hệ thống bằng từ khóa hoặc mô tả. Gọi hàm này khi khách hỏi về sản phẩm, muốn mua hàng, hoặc cần nguyên liệu nấu ăn.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Từ khóa hoặc mô tả cần tìm (VD: thịt heo, rau củ organic, cà chua tươi)",
          },
          limit: {
            type: "integer",
            description: "Số lượng kết quả trả về, mặc định 6",
            default: 6,
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_top_products",
      description:
        "Lấy danh sách các sản phẩm bán chạy nhất, nổi bật hoặc phổ biến nhất trong cửa hàng, dựa trên số lượng đã bán thực tế. Gọi hàm này khi khách hỏi: 'có gì ngon không', 'gợi ý cho tôi', 'sản phẩm nào bán chạy nhất', 'best-seller', 'mặt hàng hot', 'hôm nay nên mua gì', 'đề xuất sản phẩm'.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "integer",
            description: "Số lượng sản phẩm gợi ý, mặc định là 5",
            default: 5,
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_order_status",
      description:
        "Tra cứu đơn hàng CỤ THỂ khi khách ĐÃ CUNG CẤP mã đơn hàng trong tin nhắn (VD: 'đơn 123456 đến đâu rồi', 'mã đơn 789 của tôi'). TUYỆT ĐỐI KHÔNG gọi tool này khi khách hỏi chung chung về đơn hàng của họ mà không có mã số cụ thể.",
      parameters: {
        type: "object",
        properties: {
          order_code: {
            type: "string",
            description: "Mã đơn hàng (số nguyên, VD: '123456')",
          },
        },
        required: ["order_code"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_active_orders",
      description:
        "Lấy đơn hàng ĐANG XỬ LÝ (pending/confirmed/processing/shipping) của khách. Gọi khi khách hỏi: đơn đang ở đâu, kiểm tra trạng thái, khi nào giao, đã thanh toán chưa, phương thức thanh toán, tổng tiền, sản phẩm đã đặt. KHÔNG cần mã đơn.",
      parameters: {
        type: "object",
        properties: {
          select_order_code: {
            type: "number",
            description:
              "orderCode nếu khách chọn đơn cụ thể (đơn mới nhất, đơn đầu tiên). Bỏ trống nếu chưa chọn.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_orders",
      description:
        "Lấy 5 đơn hàng gần nhất (gồm cả đã giao/hủy). Chỉ gọi khi khách hỏi LỊCH SỬ đơn hàng nói chung.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_voucher",
      description:
        "Tra cứu thông tin, điều kiện và trạng thái của một mã giảm giá (voucher). Gọi khi khách hỏi về một mã khuyến mãi cụ thể.",
      parameters: {
        type: "object",
        properties: {
          voucher_code: {
            type: "string",
            description: "Mã giảm giá cần tra cứu (VD: SALE50, FREESHIP100)",
          },
        },
        required: ["voucher_code"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_available_vouchers",
      description:
        "Lấy DANH SÁCH tất cả voucher đang có hiệu lực, xếp hạng mức tiết kiệm. Gọi khi khách hỏi: có voucher nào không, mã giảm giá nào tiết kiệm nhất, đơn hàng này nên dùng voucher nào, có voucher phù hợp không.",
      parameters: {
        type: "object",
        properties: {
          order_total: {
            type: "number",
            description:
              "Tổng giá trị đơn hàng (nếu có) để tìm voucher phù hợp nhất",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_voucher_policy",
      description:
        "Giải thích chính sách voucher: áp dụng sản phẩm nào, sản phẩm đang giảm giá có dùng được không, đơn tối thiểu, hết hạn, có dùng nhiều voucher cùng lúc không.",
      parameters: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            description:
              "Chủ đề: san_pham_giam_gia, don_toi_thieu, nhieu_voucher, pham_vi, het_han, chung",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_store_policy",
      description:
        "Lấy thông tin chính sách của cửa hàng như giao hàng, đổi trả, thanh toán, bảo hành.",
      parameters: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            description:
              "Chủ đề chính sách cần hỏi (VD: giao hàng, đổi trả, thanh toán)",
          },
        },
        required: ["topic"],
      },
    },
  },
];

//  2. Executor: Thực thi từng Tool Call
/**
 * @param {object} toolCall - tool_call object từ OpenAI
 * @param {string|null} userId  - User ID (null nếu khách)
 */
const executeTool = async (toolCall, userId) => {
  const name = toolCall.function.name;
  let args = {};
  try {
    // arguments luôn là một CHUỖI VĂN BẢN (String) chứa định dạng JSON
    args = JSON.parse(toolCall.function.arguments || "{}");
  } catch {
    console.error(
      "[executeTool] Lỗi parse arguments:",
      toolCall.function.arguments,
    );
  }

  try {
    switch (name) {
      // ── get_top_products ──
      case "get_top_products": {
        const { limit = 5 } = args;
        const topProducts = await productModel.findTopSelling(limit);
        if (topProducts && topProducts.length > 0) {
          const result = topProducts.map((p) => ({
            title: p.title,
            slug: p.slug,
            price: p.price,
            unit: p.unit || "san pham",
            stock:
              p.stock > 0
                ? `Con ${p.stock} ${p.unit || ""}`.trim()
                : "Het hang",
            soldCount: p.soldCount || 0,
            discountPercentage: p.discountPercentage || 0,
            description: stripHtml(p.description || "").substring(0, 120),
          }));
          return JSON.stringify({ found: result.length, products: result });
        }
        return JSON.stringify({ message: "Hien khong co du lieu goi y." });
      }

      // ── search_products ──
      case "search_products": {
        const { query, limit = 6 } = args;
        const embedding = await getEmbeddingCached(query);
        let products = await productModel.findByVectorSearch(embedding, limit);
        if (!products || products.length === 0) {
          const keywords = query
            .replace(/[?!.,;:"']/g, " ") // Loại bỏ các ký tự đặc biệt và dấu câu.
            .split(" ")
            .map((w) => w.trim().toLowerCase())
            .filter((w) => w.length > 1);
          if (keywords.length > 0) {
            products = await productModel.findByKeywords(keywords, { limit });
          }
        }
        if (products && products.length > 0) {
          const result = products.map((p) => ({
            title: p.title,
            slug: p.slug,
            price: p.price,
            unit: p.unit,
            discountPercentage: p.discountPercentage || 0,
            stock: p.stock > 0 ? `Con ${p.stock} ${p.unit}` : "Het hang",
            category: p.primary_category?.title || "",
            description: stripHtml(p.description).substring(0, 120),
          }));
          return JSON.stringify({ found: result.length, products: result });
        }
        return JSON.stringify({
          found: 0,
          message: "Khong tim thay san pham nao phu hop.",
        });
      }

      // ── get_order_status (theo ma don cu the) ──
      case "get_order_status": {
        const { order_code } = args;
        const order = await orderModel.findByOrderCode(order_code);
        if (!order) {
          return JSON.stringify({
            message: `Khong tim thay don hang ma ${order_code}.`,
          });
        }
        if (
          userId &&
          order.userId &&
          order.userId.toString() !== userId.toString()
        ) {
          return JSON.stringify({
            error: "Don hang nay khong thuoc tai khoan cua ban.",
          });
        }
        return JSON.stringify({
          id: order._id.toString(),
          orderCode: order.orderCode,
          status: ORDER_STATUS_MAP[order.status] || order.status,
          totalPrice: order.totalPrice,
          shippingFee: order.shippingFee,
          note: "Lưu ý: totalPrice là tổng tiền CUỐI CÙNG (đã cộng phí vận chuyển). Không báo là chưa bao gồm phí.",
          createdAt: new Date(order.createdAt).toLocaleDateString("vi-VN"),
          items: (order.items || []).length,
        });
      }

      // ── get_active_orders (KHONG can ma don, tu dong tim) ──
      case "get_active_orders": {
        if (!userId) {
          return JSON.stringify({
            requireLogin: true,
            message:
              "Ban chua dang nhap. Vui long dang nhap de xem don hang dang xu ly.",
          });
        }

        const activeOrders = await orderModel.findActiveByUserId(userId);

        if (!activeOrders || activeOrders.length === 0) {
          return JSON.stringify({
            count: 0,
            message:
              "Ban hien khong co don hang nao dang duoc xu ly (pending/confirmed/processing/shipping).",
          });
        }

        // Neu khach chi dinh ma don cu the
        const { select_order_code } = args;
        if (select_order_code) {
          const picked = activeOrders.find(
            (o) => Number(o.orderCode) === Number(select_order_code),
          );
          if (picked) return JSON.stringify(formatOrderDetail(picked));
        }

        // Chi co 1 don -> tu dong chon
        if (activeOrders.length === 1) {
          return JSON.stringify({
            count: 1,
            selectedOrder: formatOrderDetail(activeOrders[0]),
          });
        }

        // Nhieu don -> hoi khach chon
        return JSON.stringify({
          count: activeOrders.length,
          needSelection: true,
          message: `Ban co ${activeOrders.length} don hang dang xu ly. Vui long cho biet ban muon xem don nao?`,
          orders: activeOrders.map((o) => ({
            id: o._id.toString(),
            orderCode: o.orderCode,
            status: ORDER_STATUS_MAP[o.status] || o.status,
            totalPrice: o.totalPrice,
            itemCount: (o.items || []).length,
            createdAt: new Date(o.createdAt).toLocaleDateString("vi-VN"),
          })),
        });
      }

      // ── get_recent_orders (lich su don hang) ──
      case "get_recent_orders": {
        if (!userId) {
          return JSON.stringify({
            error:
              "Ban chua dang nhap. Vui long dang nhap de xem lich su don hang.",
          });
        }
        const orders = await orderModel.findRecentByUserId(userId, 5);
        if (!orders || orders.length === 0) {
          return JSON.stringify({ message: "Ban chua co don hang nao." });
        }
        return JSON.stringify({
          total: orders.length,
          orders: orders.map((o) => ({
            id: o._id.toString(),
            orderCode: o.orderCode,
            status: ORDER_STATUS_MAP[o.status] || o.status,
            totalPrice: o.totalPrice,
            paymentMethod: o.payment?.paymentMethod || "Chua ro",
            createdAt: new Date(o.createdAt).toLocaleDateString("vi-VN"),
          })),
        });
      }

      // ── lookup_voucher (ma cu the) ──
      case "lookup_voucher": {
        const { voucher_code } = args;
        const voucher = await voucherModel.findOneByCode(voucher_code);
        if (!voucher) {
          return JSON.stringify({
            message: `Ma voucher "${voucher_code}" khong ton tai hoac da bi xoa.`,
          });
        }
        const now = new Date();
        let statusText = "Con hieu luc";
        if (new Date(voucher.endDate) < now) statusText = "Da het han";
        else if (new Date(voucher.startDate) > now)
          statusText = "Chua den ngay ap dung";
        else if (voucher.quantity <= voucher.usedCount)
          statusText = "Da het luot su dung";
        else if (userId) {
          const usageCount = await voucherUsageModel.countUsageByUser(
            voucher._id,
            userId,
          );
          if (usageCount >= voucher.usageLimitPerUser) {
            statusText = "Ban da het luot su dung ma nay";
          }
        }

        return JSON.stringify({
          code: voucher.code,
          name: voucher.name,
          description: voucher.description,
          type: voucher.type,
          discountValue: voucher.discountValue,
          maxDiscountAmount: voucher.maxDiscountAmount,
          minOrderValue: voucher.minOrderValue,
          applyFor: voucher.applyFor,
          endDate: new Date(voucher.endDate).toLocaleDateString("vi-VN"),
          status: statusText,
          remaining: voucher.quantity - voucher.usedCount,
        });
      }

      // ── get_available_vouchers (tu dong kham pha) ──
      case "get_available_vouchers": {
        const { order_total } = args;
        let vouchers = await voucherModel.findActiveVouchers();

        // Neu khach da dang nhap, loai bo cac voucher ma khach da dung het luot
        if (userId && vouchers && vouchers.length > 0) {
          const voucherIds = vouchers.map((v) => v._id);
          const usageMap = await voucherUsageModel.countUsagesByUser(
            userId,
            voucherIds,
          );

          vouchers = vouchers.filter((v) => {
            const usageCount = usageMap[v._id.toString()] || 0;
            return usageCount < (v.usageLimitPerUser || 1);
          });
        }

        if (!vouchers || vouchers.length === 0) {
          return JSON.stringify({
            message:
              "Hien tai chua co voucher nao dang co hieu luc phu hop voi ban.",
          });
        }

        // Tinh so tien giam uoc tinh cho tung voucher (de xep hang)
        const ranked = vouchers
          .map((v) => {
            let estimatedDiscount = 0;
            const base = order_total || v.minOrderValue || 0;
            if (v.type === "money") {
              estimatedDiscount = v.discountValue;
            } else if (v.type === "percent") {
              estimatedDiscount = (base * v.discountValue) / 100;
              if (v.maxDiscountAmount)
                estimatedDiscount = Math.min(
                  estimatedDiscount,
                  v.maxDiscountAmount,
                );
            } else if (v.type === "freeship") {
              estimatedDiscount = v.discountValue;
            }

            const eligible = !order_total || order_total >= v.minOrderValue;

            return {
              code: v.code,
              name: v.name,
              type: v.type,
              discountValue: v.discountValue,
              maxDiscountAmount: v.maxDiscountAmount || null,
              minOrderValue: v.minOrderValue || 0,
              applyFor: v.applyFor,
              endDate: new Date(v.endDate).toLocaleDateString("vi-VN"),
              remaining: v.quantity - v.usedCount,
              isFeatured: v.isFeatured || false,
              estimatedDiscount,
              eligible,
            };
          })
          .sort((a, b) => {
            if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
            return b.estimatedDiscount - a.estimatedDiscount;
          });

        const eligibleList = ranked.filter((v) => v.eligible);
        return JSON.stringify({
          total: ranked.length,
          eligibleCount: eligibleList.length,
          orderTotal: order_total || null,
          vouchers: ranked,
          bestVoucher: eligibleList[0] || null,
        });
      }

      // ── get_voucher_policy (chinh sach voucher) ──
      case "get_voucher_policy": {
        const topic = (args.topic || "chung").toLowerCase();
        const policies = {
          san_pham_giam_gia:
            "Voucher SmartFood CÓ áp dụng được cho sản phẩm đang giảm giá. Hệ thống không có ràng buộc nào cấm dùng voucher trên sản phẩm đã có giảm giá. Tuy nhiên, voucher loại 'category' chỉ áp dụng cho sản phẩm thuộc danh mục được chỉ định, bất kể sản phẩm có đang giảm giá hay không.",
          don_toi_thieu:
            "Mỗi voucher có mức đơn tối thiểu riêng (minOrderValue). Nếu tổng giá trị các sản phẩm đủ điều kiện nhỏ hơn minOrderValue, voucher sẽ bị từ chối. Vui lòng kiểm tra điều kiện đơn tối thiểu của từng voucher cụ thể.",
          nhieu_voucher:
            "KHÔNG. Chính sách SmartFood chỉ cho phép áp dụng DUY NHẤT MỘT voucher cho mỗi đơn hàng. Bạn nên chọn voucher giảm nhiều nhất phù hợp với đơn hàng của mình.",
          pham_vi:
            "Có 2 loại phạm vi áp dụng: (1) applyFor='all' — áp dụng cho TẤT CẢ sản phẩm trong đơn hàng. (2) applyFor='category' — chỉ áp dụng cho sản phẩm thuộc DANH MỤC được chỉ định. Nếu giỏ hàng không có sản phẩm thuộc danh mục đó, voucher sẽ không hoạt động.",
          het_han:
            "Voucher hết hiệu lực khi: (1) Quá ngày endDate, (2) Đã dùng hết số lượt (usedCount >= quantity), (3) Admin tắt trạng thái (status = inactive). Một số voucher còn có giới hạn lượt dùng theo từng người dùng (usageLimitPerUser), mặc định là 1 lần/người.",
          chung:
            "Chính sách voucher SmartFood: (1) Chỉ được dùng 1 voucher cho mỗi đơn hàng. (2) Có 3 loại: giảm tiền mặt (money), giảm phần trăm (percent, có thể có mức giảm tối đa), miễn phí vận chuyển (freeship). (3) Có thể áp dụng cho tất cả sản phẩm hoặc chỉ danh mục cụ thể. (4) Có thể dùng trên sản phẩm đang giảm giá. (5) Mỗi voucher có thể có giới hạn đơn tối thiểu, giới hạn tổng lượt dùng và giới hạn lượt dùng theo từng người.",
        };

        const policy = policies[topic] || policies.chung;
        return JSON.stringify({ topic, policy });
      }

      // ── get_store_policy ──
      case "get_store_policy": {
        const topic = (args.topic || "").toLowerCase();
        const policies = {
          "giao hang":
            "SmartFood chi ho tro giao hang noi thanh Da Nang. Phi giao hang tinh tu dong theo khoang cach (khong mien phi). Don dat truoc 18:00 giao trong ngay, sau 18:00 giao sang hom sau.",
          "doi tra":
            "Doi tra/hoan tien 100% trong 24h (hang tuoi song 2h) doi voi san pham loi/hu hong. Gui yeu cau tai trang chi tiet don hang hoac lien he Hotline/Zalo.",
          "hoan tien":
            "Hoan qua chuyen khoan ngan hang (don COD) trong 24h lam viec. Don PayOS hoan 1-2 ngay lam viec.",
          "thanh toan":
            "SmartFood ho tro: Tien mat khi nhan hang (COD) va Thanh toan truc tuyen VietQR qua PayOS.",
          "huy don":
            "Khach co the huy don trong 30 phut ke tu khi dat thanh cong. Sau thoi gian nay, lien he Hotline hoac Zalo.",
          "bao mat":
            "Du lieu ca nhan ma hoa HTTPS, tuyet doi khong chia se voi ben thu ba.",
        };
        for (const key in policies) {
          if (topic.includes(key)) {
            return JSON.stringify({ topic: key, policy: policies[key] });
          }
        }
        return JSON.stringify({
          topic: "chung",
          policy:
            "Vui long xem chi tiet tren website hoac lien he Hotline/Zalo. Chinh sach: Giao hang noi thanh Da Nang, thanh toan COD/PayOS, doi tra loi trong 24h.",
        });
      }

      default:
        return JSON.stringify({
          error: `Tool "${name}" khong duoc nhan dang.`,
        });
    }
  } catch (err) {
    console.error(`[executeTool:${name}] Loi:`, err.message);
    return JSON.stringify({
      error: `Loi khi thuc thi ${name}: ${err.message}`,
    });
  }
};

//  Helper: format chi tiet don hang
const formatOrderDetail = (order) => ({
  id: order._id.toString(),
  orderCode: order.orderCode,
  status: ORDER_STATUS_MAP[order.status] || order.status,
  totalPrice: order.totalPrice,
  shippingFee: order.shippingFee,
  discountVoucher: order.discountVoucher || 0,
  voucherCode: order.voucherCode || null,
  createdAt: new Date(order.createdAt).toLocaleDateString("vi-VN"),
  address: order.userInfo
    ? `${order.userInfo.address}, ${order.userInfo.ward}, ${order.userInfo.district}, ${order.userInfo.province}`
    : null,
  paymentMethod: order.payment?.paymentMethod || null,
  paymentStatus: order.payment?.status || null,
  items: (order.items || []).map((item) => ({
    title: item.title,
    quantity: item.quantity,
    price: item.price,
  })),
});

//  3. System Prompt
const SYSTEM_PROMPT = `Bạn là trợ lý AI của SmartFood — hệ thống bán lẻ thực phẩm tươi sạch, an toàn, tiết kiệm.

## Mục tiêu
- Hỗ trợ khách hàng tìm sản phẩm, tra cứu đơn hàng, kiểm tra voucher, tư vấn dinh dưỡng và nấu ăn.
- Giới thiệu thông tin về SmartFood (SmartFood là website gì, bán gì, sứ mệnh, giá trị, hoạt động ở đâu...).
- Luôn trả lời bằng ngôn ngữ của người dùng (tiếng Việt hoặc tiếng Anh).

## Phạm vi hoạt động & Chính sách từ chối (Guardrails)
- Chỉ trả lời các câu hỏi trong phạm vi hoạt động của SmartFood:
  - Giới thiệu và trả lời thông tin về chính SmartFood (SmartFood là hệ thống bán lẻ thực phẩm tươi sạch, an toàn, tiết kiệm tại Đà Nẵng, kết nối nông sản trực tiếp từ nông trại đến bàn ăn gia đình).
  - Tìm kiếm sản phẩm, xem trạng thái/lịch sử đơn hàng, chính sách cửa hàng (giao hàng ở Đà Nẵng, đổi trả, bảo hành...), khuyến mãi/voucher, tư vấn nấu ăn và dinh dưỡng liên quan đến sản phẩm của cửa hàng.
- Tuyệt đối TỪ CHỐI trả lời và không giải quyết các yêu cầu ngoài phạm vi, bao gồm:
  - Yêu cầu viết code/lập trình.
  - Câu hỏi kiến thức tổng quát, lịch sử, địa lý, chính trị không liên quan đến cửa hàng.
  - Giải đề toán, khoa học, văn học học thuật.
  - Các câu hỏi khác ngoài phạm vi trang web SmartFood.
- Tuyệt đối TỪ CHỐI các yêu cầu độc hại, vi phạm bảo mật hoặc quyền riêng tư:
  - Hướng dẫn hack/xâm nhập hệ thống.
  - Yêu cầu cung cấp thông tin cá nhân của người khác.
  - Hướng dẫn chế tạo chất nổ, vũ khí, chất độc hại.
- Khi từ chối, hãy sử dụng một câu trả lời lịch sự, ngắn gọn và hướng người dùng quay lại chủ đề của SmartFood (ví dụ: "Xin lỗi, tôi chỉ có thể hỗ trợ các thông tin liên quan đến sản phẩm, dịch vụ và chính sách của SmartFood. Tôi có thể giúp gì cho bạn về mua sắm hôm nay không?").

## Quy tắc sử dụng Tools
- Khi khách yêu cầu GỢI Ý SẢN PHẨM hoặc HÀNG BÁN CHẠY: gọi "get_top_products".
- Khi khách hỏi về SẢN PHẨM hay NGUYÊN LIỆU: LUÔN gọi "search_products" trước.
- Khi khách hỏi CHẾ ĐỘ ĂN UỐNG, DINH DƯỠNG: gọi "search_products" với từ khóa liên quan.
- Khi khách hỏi CÔNG THỨC NẤU ĂN: Cung cấp công thức VÀ gọi "search_products" để gợi ý nguyên liệu.
- Khi khách cung cấp MÃ ĐƠN HÀNG cụ thể (số) trong tin nhắn: gọi "get_order_status".
- Khi khách hỏi về TRẠNG THÁI ĐƠN HÀNG, ĐƠN ĐANG XỬ LÝ, KHI NÀO GIAO, SẢN PHẨM ĐÃ ĐẶT, ĐÃ THANH TOÁN CHƯA, PHƯƠNG THỨC THANH TOÁN, TỔNG TIỀN ĐƠN mà KHÔNG có mã đơn: LUÔN LUÔN gọi "get_active_orders" ngay lập tức — TUYỆT ĐỐI KHÔNG tự hỏi lại mã đơn, KHÔNG tự trả lời "vui lòng cung cấp mã đơn". Tool get_active_orders sẽ tự xử lý trường hợp chưa đăng nhập.
- Khi khách hỏi VỀ LỊCH SỬ đơn hàng nói chung (đã giao, đã hủy,...): gọi "get_recent_orders".
- Khi khách hỏi về MÃ VOUCHER cụ thể (VD: SALE50 còn hiệu lực không): gọi "lookup_voucher".
- Khi khách hỏi DANH SÁCH VOUCHER, CÓ VOUCHER NÀO KHÔNG, VOUCHER TIẾT KIỆM NHẤT, VOUCHER PHÙ HỢP: gọi "get_available_vouchers".
- Khi khách hỏi về QUY TẮC VOUCHER (áp dụng cho sản phẩm giảm giá không, dùng nhiều voucher không, đơn tối thiểu, phạm vi áp dụng): gọi "get_voucher_policy".
- Khi khách hỏi về CHÍNH SÁCH CỬA HÀNG (giao hàng, đổi trả, thanh toán): gọi "get_store_policy".
- Khi câu hỏi là chào hỏi xã giao: Trả lời thân thiện, KHÔNG cần gọi tool.

## Quy tắc hiển thị kết quả
- TUYỆT ĐỐI KHÔNG bịa tên sản phẩm, giá, thông tin không có trong kết quả tool.
- MỌI SẢN PHẨM phải dùng định dạng link Markdown là đường dẫn TƯƠNG ĐỐI: [Tên Sản Phẩm](/product/slug)
  - TUYỆT ĐỐI KHÔNG thêm domain (http/https) vào link. CHỈ DÙNG "/product/slug".
  - Đúng: [Thịt Bò Úc Nhập Khẩu](/product/thit-bo-uc)
  - Sai: [Thịt Bò Úc](https://smartfood.vn/product/thit-bo-uc)
  - TUYỆT ĐỐI KHÔNG tự tạo link cho các danh mục chung chung (VD: không tạo link kiểu [Rau xanh](/product/rau-xanh) hay [Trái cây](/product/trai-cay)) nếu trong kết quả của tool không trả về sản phẩm cụ thể có slug đó. Chỉ gắn link cho sản phẩm thực tế có slug hợp lệ được trả về từ tool "search_products" hoặc "get_top_products".
- MỌI ĐƠN HÀNG phải dùng định dạng link Markdown TƯƠNG ĐỐI: [Mã đơn: <orderCode>](/order/<id>)
  - Bắt buộc dùng trường "id" (chuỗi 24 ký tự) trả về từ kết quả để gắn link (/order/<id>).
  - Bắt buộc dùng trường "orderCode" (ví dụ: 742962321) để hiển thị tên mã đơn hàng.
  - Tuyệt đối không hiển thị mã ID MongoDB (chuỗi 24 ký tự) dưới dạng text thô, và không hiển thị 2 mã đơn hàng cùng lúc. Chỉ hiển thị duy nhất một định dạng như ví dụ bên dưới.
  - Đúng: [Mã đơn: 742962321](/order/6a23fb32fa534002517923e2)
  - Sai: Mã đơn: 6a23fb32fa534002517923e2 hay hiển thị cả hai mã đơn.
- Hiển thị ĐẦY ĐỦ tất cả sản phẩm trong kết quả, không tự rút gọn.
- Giọng văn tự nhiên, thân thiện, không quảng cáo quá mức.`;

//  4. Main: sendMessage (Agentic Loop) ko dùng nữa đổi sang dùng sendMessageStream
const sendMessage = async ({ message, sessionId, userId = null }) => {
  if (!message?.trim()) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Tin nhắn không được để trống!",
    );
  }
  if (!sessionId) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "SessionId là bắt buộc!");
  }

  // Lưu/tạo session trong MongoDB
  await chatbotMessageModel.upsertSession({ sessionId, userId });
  const session = await chatbotMessageModel.findSession({ sessionId, userId });
  // Lấy orderContext từ session để hỗ trợ hội thoại đơn hàng liên tục
  const sessionOrderCtx = session?.orderContext || null;

  // Lịch sử hội thoại — giữ 10 tin nhắn gần nhất để tiết kiệm token
  const history = (session?.messages || [])
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content }));

  // Khởi tạo messages array gửi cho OpenAI
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
    { role: "user", content: message.trim() },
  ];

  let aiReply = "";

  try {
    // BƯỚC 1: Gọi OpenAI lần 1 — AI tự quyết định gọi Tool nào
    const firstResponse = await openai.chat.completions.create({
      model: GPT_MODEL,
      messages,
      tools: TOOLS,
      tool_choice: "auto", // "auto" = AI tự quyết; "none" = không dùng tool
      temperature: 0.7,
      max_tokens: 1000,
    });

    const assistantMessage = firstResponse.choices[0].message;
    const toolCalls = assistantMessage.tool_calls;

    if (toolCalls && toolCalls.length > 0) {
      // BƯỚC 2: Thực thi song song tất cả Tool Calls (Promise.all)
      console.log(`[Agent] AI yêu cầu ${toolCalls.length} tool call(s)`);

      // Thêm tin nhắn assistant (chứa tool_calls) vào lịch sử context
      messages.push(assistantMessage);

      // Chạy tất cả tools song song để tối ưu thời gian phản hồi
      const toolResults = await Promise.all(
        toolCalls.map(async (toolCall) => {
          const output = await executeTool(toolCall, userId);
          return {
            tool_call_id: toolCall.id,
            role: "tool",
            name: toolCall.function.name,
            content: output,
          };
        }),
      );

      // Thêm kết quả tool vào context
      messages.push(...toolResults);

      // BƯỚC 3: Gọi OpenAI lần 2 — Tổng hợp câu trả lời cuối cùng
      const secondResponse = await openai.chat.completions.create({
        model: GPT_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 1000,
      });

      aiReply = secondResponse.choices[0]?.message?.content?.trim() || "";
    } else {
      // Không có tool call → AI trả lời trực tiếp (chào hỏi, câu hỏi chung...)
      aiReply = assistantMessage.content?.trim() || "";
    }
  } catch (openAIError) {
    console.error(
      "[Chatbot OpenAI Error]",
      openAIError?.message || openAIError,
    );
    if (openAIError?.status === 429) {
      throw new ApiError(
        StatusCodes.TOO_MANY_REQUESTS,
        "Chatbot đang bận, vui lòng thử lại sau giây lát! 🙏",
      );
    }
    if (openAIError?.status === 401) {
      throw new ApiError(
        StatusCodes.INTERNAL_SERVER_ERROR,
        "Cấu hình API Key không hợp lệ, vui lòng liên hệ quản trị viên.",
      );
    }
    throw new ApiError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      "Không thể kết nối AI, vui lòng thử lại!",
    );
  }

  if (!aiReply) {
    aiReply = "Xin lỗi, tôi không thể trả lời lúc này. Vui lòng thử lại! 🙏";
  }

  // Lưu lịch sử hội thoại vào MongoDB
  const now = new Date();
  await chatbotMessageModel.pushMessages({ sessionId, userId }, [
    { role: "user", content: message.trim(), createdAt: now },
    { role: "assistant", content: aiReply, createdAt: now },
  ]);

  return { reply: aiReply, sessionId };
};

// ─── clearHistory
const clearHistory = async ({ sessionId, userId = null }) => {
  if (!sessionId && !userId) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Cần có sessionId hoặc userId!",
    );
  }

  const session = await chatbotMessageModel.findSession({ sessionId, userId });
  if (!session) return { cleared: true };

  if (userId && session.userId && session.userId.toString() !== userId) {
    throw new ApiError(
      StatusCodes.FORBIDDEN,
      "Không có quyền xóa lịch sử này!",
    );
  }

  await GET_DB()
    .collection(chatbotMessageModel.CHATBOT_MESSAGE_COLLECTION_NAME)
    .updateOne(
      { _id: session._id },
      { $set: { messages: [], updatedAt: new Date() } },
    );

  return { cleared: true };
};

//  getHistory
const getHistory = async ({ sessionId, userId = null }) => {
  if (!sessionId && !userId) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Cần có sessionId hoặc userId!",
    );
  }

  const session = await chatbotMessageModel.findSession({ sessionId, userId });
  if (!session) return { messages: [] };

  return { messages: session.messages || [] };
};

//  invalidateProductCache (no-op — tương thích Controller cũ)
const invalidateProductCache = () => {
  // No-op trong kiến trúc Function Calling — không còn dùng snapshot cache
};

//  5. sendMessageStream — SSE Streaming Response
/**
 * Giống sendMessage nhưng trả về câu trả lời theo cơ chế SSE (stream: true).
 * Người dùng thấy chữ xuất hiện ngay lập tức thay vì chờ toàn bộ câu trả lời.
 *
 * @param {object} params
 * @param {string} params.message   - Tin nhắn của user
 * @param {string} params.sessionId - Session ID
 * @param {string|null} params.userId - User ID (null nếu khách vãng lai)
 * @param {object} params.res       - Express Response object (để ghi SSE)
 */
const sendMessageStream = async ({
  message,
  sessionId,
  userId = null,
  res,
}) => {
  if (!message?.trim())
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Tin nhắn không được để trống!",
    );
  if (!sessionId)
    throw new ApiError(StatusCodes.BAD_REQUEST, "SessionId là bắt buộc!");

  // Thiết lập headers SSE
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8"); // Báo cho trình duyệt biết đây là kết nối stream dữ liệu liên tục
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Tắt buffer trên Nginx
  res.flushHeaders();

  /** Ghi một chunk SSE xuống client */
  const emit = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    // Lấy lịch sử hội thoại và orderContext
    await chatbotMessageModel.upsertSession({ sessionId, userId });
    const session = await chatbotMessageModel.findSession({
      sessionId,
      userId,
    });
    const sessionOrderCtx = session?.orderContext || null;
    const history = (session?.messages || [])
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
      { role: "user", content: message.trim() },
    ];

    // BƯỚC 1: OpenAI lần 1 — phân tích ý định và gọi Tool
    const firstResponse = await openai.chat.completions.create({
      model: GPT_MODEL,
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      temperature: 0.7, // Độ sáng tạo của AI: 0.0 -> 2.0
      max_tokens: 1000,
    });

    const assistantMessage = firstResponse.choices[0].message;
    const toolCalls = assistantMessage.tool_calls;

    if (toolCalls && toolCalls.length > 0) {
      // BƯỚC 2: Thực thi song song tất cả tools
      emit({ type: "tool_start", count: toolCalls.length }); // Thông báo cho Client biết AI đang chạy Tool
      messages.push(assistantMessage);

      const toolResults = await Promise.all(
        toolCalls.map(async (toolCall) => {
          const output = await executeTool(toolCall, userId);
          return {
            tool_call_id: toolCall.id,
            role: "tool",
            name: toolCall.function.name,
            content: output,
          };
        }),
      );
      messages.push(...toolResults);

      // BƯỚC 3: OpenAI lần 2 — STREAM câu trả lời cuối cùng
      const stream = await openai.chat.completions.create({
        model: GPT_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 1000,
        stream: true, // ← BẬT STREAMING
      });

      // Nhận từng mảnh (chunk) chữ và bắn ngay về cho client
      let aiReply = "";
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          aiReply += delta;
          emit({ type: "chunk", content: delta });
        }
      }

      // Lưu lịch sử và báo hoàn thành
      const now = new Date();
      await chatbotMessageModel.pushMessages({ sessionId, userId }, [
        { role: "user", content: message.trim(), createdAt: now },
        { role: "assistant", content: aiReply, createdAt: now },
      ]);
      emit({ type: "done", sessionId });
    } else {
      // Không có tool → stream trực tiếp câu trả lời ngắn
      const stream = await openai.chat.completions.create({
        model: GPT_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 500,
        stream: true,
      });

      let aiReply = "";
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          aiReply += delta;
          emit({ type: "chunk", content: delta });
        }
      }

      const now = new Date();
      await chatbotMessageModel.pushMessages({ sessionId, userId }, [
        { role: "user", content: message.trim(), createdAt: now },
        { role: "assistant", content: aiReply, createdAt: now },
      ]);
      emit({ type: "done", sessionId });
    }
  } catch (err) {
    console.error("[sendMessageStream] Lỗi:", err.message);
    emit({ type: "error", message: "Không thể kết nối AI, vui lòng thử lại!" });
  } finally {
    res.end();
  }
};

export const chatbotService = {
  sendMessage,
  sendMessageStream,
  clearHistory,
  getHistory,
  invalidateProductCache,
};
