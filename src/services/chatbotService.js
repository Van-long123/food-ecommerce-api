/**
 * chatbotService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Kiến trúc: AI Agent sử dụng OpenAI Function Calling (Tool Calling)
 *
 * Luồng hoạt động (Agentic Loop):
 *   1. User gửi tin nhắn
 *   2. Gọi OpenAI lần 1 kèm danh sách Tools → AI tự quyết định gọi hàm nào
 *   3. Nếu có tool_calls → thực thi song song (Promise.all) → lấy dữ liệu DB/API
 *   4. Gọi OpenAI lần 2 kèm kết quả tool → AI tổng hợp câu trả lời tự nhiên
 *   5. Lưu lịch sử MongoDB → trả về response
 * ─────────────────────────────────────────────────────────────────────────────
 */

import OpenAI from "openai";
import axios from "axios";
import { env } from "~/config/environment";
import { GET_DB } from "~/config/mongodb";
import { chatbotMessageModel } from "~/models/chatbotMessageModel";
import { productModel } from "~/models/productModel";
import { orderModel } from "~/models/orderModel";
import { voucherModel } from "~/models/voucherModel";
import ApiError from "~/utils/ApiError";
import { StatusCodes } from "http-status-codes";

// ─── OpenAI Client ────────────────────────────────────────────────────────────
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const GPT_MODEL = "gpt-4o-mini";
const EMBED_MODEL = "text-embedding-3-small"; // 1536 chiều

// ─── Redis Client (Embedding Cache) ──────────────────────────────────────────
import { createClient } from "redis";

let redisClient = null;

const getRedis = async () => {
  if (redisClient && redisClient.isOpen) return redisClient;
  try {
    redisClient = createClient({
      url: env.REDIS_URL || "redis://localhost:6379",
      RESP: 2
    });
    redisClient.on("error", (e) => console.warn("[Redis] Lỗi kết nối:", e.message));
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
      const cached = await redis.get(cacheKey);
      if (cached) {
        console.log(`[Cache HIT] embed: "${text.slice(0, 40)}..."`);
        return JSON.parse(cached);
      }
    }
  } catch (e) {
    console.warn("[Redis] Lỗi đọc cache:", e.message);
  }

  // Cache MISS → gọi OpenAI
  const res = await openai.embeddings.create({ model: EMBED_MODEL, input: text });
  const vector = res.data[0].embedding;

  try {
    const redis = await getRedis();
    if (redis) {
      await redis.setEx(cacheKey, 86400, JSON.stringify(vector)); // TTL 24h
      console.log(`[Cache SET] embed: "${text.slice(0, 40)}..."`);
    }
  } catch (e) {
    console.warn("[Redis] Lỗi ghi cache:", e.message);
  }

  return vector;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── 1. Khai báo Tools (JSON Schema chuẩn OpenAI) ─────────────────────────────
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
      name: "get_recommendations",
      description:
        "Lấy danh sách sản phẩm gợi ý bán chạy, phổ biến nhất. Gọi khi khách hỏi 'có gì ngon', 'sản phẩm nào bán chạy', 'gợi ý cho tôi'.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "integer",
            description: "Số lượng gợi ý, mặc định 5",
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
        "Tra cứu trạng thái của MỘT đơn hàng CỤ THỂ theo mã đơn. Gọi khi khách cung cấp mã đơn hàng cụ thể (VD: 'đơn 123456 của tôi đến đâu rồi').",
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
      name: "get_recent_orders",
      description:
        "Lấy danh sách các đơn hàng gần nhất của khách. Gọi khi khách hỏi chung chung về đơn hàng của họ mà KHÔNG cung cấp mã cụ thể.",
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

// ─── 2. Executor: Thực thi từng Tool Call ─────────────────────────────────────
/**
 * Nhận một toolCall object từ OpenAI, thực thi hàm tương ứng, trả về chuỗi JSON kết quả.
 * @param {object} toolCall - Đối tượng tool_call từ response OpenAI
 * @param {string|null} userId - ID user đang đăng nhập (null nếu khách vãng lai)
 */
const executeTool = async (toolCall, userId) => {
  const name = toolCall.function.name;
  let args = {};
  try {
    args = JSON.parse(toolCall.function.arguments || "{}");
  } catch {
    console.error(
      "[executeTool] Lỗi parse arguments:",
      toolCall.function.arguments,
    );
  }

  console.log(`[Agent] Thực thi tool: ${name}`, args);

  try {
    switch (name) {
      // ── Tool: Tìm kiếm sản phẩm (Vector Search + Text Fallback) ──
      case "search_products": {
        const { query, limit = 6 } = args;

        // Bước 1: Tạo embedding có cache Redis
        const embedding = await getEmbeddingCached(query);
        let products = await productModel.findByVectorSearch(embedding, limit);

        // Bước 2: Fallback sang Text Search nếu Vector Index chưa có dữ liệu
        if (!products || products.length === 0) {
          const keywords = query
            .replace(/[?!.,;:"']/g, " ")
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
            stock: p.stock > 0 ? `Còn ${p.stock} ${p.unit}` : "Hết hàng",
            category: p.primary_category?.title || "",
            description: stripHtml(p.description).substring(0, 120),
          }));
          return JSON.stringify({ found: result.length, products: result });
        }
        return JSON.stringify({
          found: 0,
          message: "Không tìm thấy sản phẩm nào phù hợp với yêu cầu.",
        });
      }

      // ── Tool: Lấy gợi ý sản phẩm bán chạy từ Python Recommendation Service ──
      case "get_recommendations": {
        const { limit = 5 } = args;
        const { data } = await axios.get(
          `${env.RECOMMENDATION_SERVICE_URL}/api/product-recommendation`,
          { params: { limit }, timeout: 4000 },
        );
        if (data?.recommendations?.length > 0) {
          return JSON.stringify({
            recommendations: data.recommendations.map((p) => ({
              title: p.title,
              slug: p.slug,
            })),
          });
        }
        return JSON.stringify({ message: "Hiện không có dữ liệu gợi ý." });
      }

      // ── Tool: Tra cứu đơn hàng theo mã cụ thể ──
      case "get_order_status": {
        const { order_code } = args;
        const order = await orderModel.findByOrderCode(order_code);
        if (!order) {
          return JSON.stringify({
            message: `Không tìm thấy đơn hàng có mã ${order_code}. Vui lòng kiểm tra lại mã đơn.`,
          });
        }
        // Kiểm tra quyền: chỉ cho xem đơn của chính mình
        if (
          userId &&
          order.userId &&
          order.userId.toString() !== userId.toString()
        ) {
          return JSON.stringify({
            error: "Đơn hàng này không thuộc về tài khoản của bạn.",
          });
        }
        return JSON.stringify({
          id: order._id.toString(),
          orderCode: order.orderCode,
          status: ORDER_STATUS_MAP[order.status] || order.status,
          totalPrice: order.totalPrice,
          shippingFee: order.shippingFee,
          createdAt: new Date(order.createdAt).toLocaleDateString("vi-VN"),
          items: (order.items || []).length,
        });
      }

      // ── Tool: Lấy danh sách đơn hàng gần nhất ──
      case "get_recent_orders": {
        if (!userId) {
          return JSON.stringify({
            error:
              "Bạn chưa đăng nhập. Vui lòng đăng nhập để xem lịch sử đơn hàng.",
          });
        }
        const orders = await orderModel.findByUserId(userId);
        const recent = (orders || []).slice(0, 5);
        if (recent.length === 0) {
          return JSON.stringify({ message: "Bạn chưa có đơn hàng nào." });
        }
        return JSON.stringify({
          total: recent.length,
          orders: recent.map((o) => ({
            id: o._id.toString(),
            orderCode: o.orderCode || o._id.toString().slice(-6),
            status: ORDER_STATUS_MAP[o.status] || o.status,
            totalPrice: o.totalPrice,
            createdAt: new Date(o.createdAt).toLocaleDateString("vi-VN"),
          })),
        });
      }

      // ── Tool: Tra cứu mã giảm giá ──
      case "lookup_voucher": {
        const { voucher_code } = args;
        const voucher = await voucherModel.findOneByCode(voucher_code);
        if (!voucher) {
          return JSON.stringify({
            message: `Mã voucher "${voucher_code}" không tồn tại hoặc đã bị xóa.`,
          });
        }
        const now = new Date();
        const isExpired = new Date(voucher.endDate) < now;
        const isNotStarted = new Date(voucher.startDate) > now;
        const isOutOfStock = voucher.quantity <= voucher.usedCount;
        let statusText = "Còn hiệu lực";
        if (isExpired) statusText = "Đã hết hạn";
        else if (isNotStarted) statusText = "Chưa đến ngày áp dụng";
        else if (isOutOfStock) statusText = "Đã hết lượt sử dụng";

        return JSON.stringify({
          code: voucher.code,
          name: voucher.name,
          description: voucher.description,
          type: voucher.type,
          discountValue: voucher.discountValue,
          maxDiscountAmount: voucher.maxDiscountAmount,
          minOrderValue: voucher.minOrderValue,
          startDate: new Date(voucher.startDate).toLocaleDateString("vi-VN"),
          endDate: new Date(voucher.endDate).toLocaleDateString("vi-VN"),
          status: statusText,
          remaining: voucher.quantity - voucher.usedCount,
        });
      }

      // ── Tool: Lấy thông tin chính sách cửa hàng ──
      case "get_store_policy": {
        const topic = (args.topic || "").toLowerCase();
        const policies = {
          "giao hàng":
            "SmartFood chỉ hỗ trợ giao hàng nội thành Đà Nẵng. Phí giao hàng tính tự động theo khoảng cách (không miễn phí giao hàng). Đơn đặt trước 18:00 giao trong ngày, sau 18:00 giao vào sáng hôm sau.",
          "đổi trả":
            "Đổi trả/hoàn tiền 100% trong 24h (hàng tươi sống xử lý trong 2h) đối với sản phẩm lỗi/hư hỏng. Gửi yêu cầu tại trang chi tiết đơn hàng hoặc liên hệ Hotline/Zalo. Shipper sẽ đến thu hồi sản phẩm miễn phí.",
          "hoàn tiền":
            "Thời gian hoàn tiền: Hoàn qua chuyển khoản ngân hàng (đơn COD) trong vòng 24 giờ làm việc. Đối với đơn thanh toán online qua cổng PayOS sẽ được hoàn từ 1-2 ngày làm việc.",
          "thanh toán":
            "SmartFood hỗ trợ 2 hình thức thanh toán: Tiền mặt khi nhận hàng (COD) và Thanh toán trực tuyến quét mã VietQR qua cổng PayOS.",
          "hủy đơn":
            "Khách hàng có thể hủy đơn hàng trong vòng 30 phút kể từ khi đặt thành công. Sau thời gian này, vui lòng liên hệ Hotline hoặc Zalo để được hỗ trợ.",
          "bảo mật":
            "Mọi dữ liệu cá nhân được mã hóa an toàn bằng chuẩn HTTPS và tuyệt đối không chia sẻ hoặc bán cho bên thứ ba vì mục đích thương mại.",
        };

        for (const key in policies) {
          if (topic.includes(key)) {
            return JSON.stringify({ topic: key, policy: policies[key] });
          }
        }
        return JSON.stringify({
          topic: "chung",
          policy:
            "Vui lòng xem chi tiết trên website hoặc liên hệ Hotline/Zalo để được hỗ trợ. Các chính sách chính: Giao hàng nội thành Đà Nẵng, thanh toán COD/PayOS, và đổi trả lỗi trong 24h.",
        });
      }

      default:
        return JSON.stringify({
          error: `Tool "${name}" không được nhận dạng.`,
        });
    }
  } catch (err) {
    console.error(`[executeTool:${name}] Lỗi:`, err.message);
    return JSON.stringify({
      error: `Lỗi khi thực thi ${name}: ${err.message}`,
    });
  }
};

// ─── 3. System Prompt ─────────────────────────────────────────────────────────
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
- Khi khách hỏi về SẢN PHẨM hay NGUYÊN LIỆU: LUÔN gọi tool "search_products" trước để lấy dữ liệu thực.
- Khi khách hỏi về CHẾ ĐỘ ĂN UỐNG, TƯ VẤN DINH DƯỠNG hoặc CÁC THỰC PHẨM tốt cho sức khỏe/giảm cân/tăng cơ: LUÔN gọi tool "search_products" với các từ khóa liên quan (như "rau xanh", "ức gà", "yến mạch", "trái cây", v.v.) để lấy danh sách sản phẩm THỰC TẾ của cửa hàng, tuyệt đối không tự bịa thông tin.
- Khi khách hỏi CÔNG THỨC NẤU ĂN: Cung cấp công thức, ĐỒNG THỜI gọi "search_products" để kiểm tra nguyên liệu SmartFood có bán không và gợi ý.
- Khi khách cung cấp MÃ ĐƠN HÀNG cụ thể: gọi "get_order_status".
- Khi khách hỏi chung về ĐƠN HÀNG của họ: gọi "get_recent_orders".
- Khi khách hỏi về MÃ VOUCHER cụ thể: gọi "lookup_voucher".
- Khi khách hỏi về CHÍNH SÁCH: gọi "get_store_policy".
- Khi câu hỏi là chào hỏi xã giao hoặc chúc mừng: Trả lời thân thiện, lịch sự và ngắn gọn, KHÔNG cần gọi tool.

## Quy tắc hiển thị kết quả
- TUYỆT ĐỐI KHÔNG bịa tên sản phẩm, giá, thông tin không có trong kết quả tool.
- MỌI SẢN PHẨM phải dùng định dạng link Markdown là đường dẫn TƯƠNG ĐỐI: [Tên Sản Phẩm](/product/slug)
  - TUYỆT ĐỐI KHÔNG thêm domain (http/https) vào link. CHỈ DÙNG "/product/slug".
  - Đúng: [Thịt Bò Úc Nhập Khẩu](/product/thit-bo-uc)
  - Sai: [Thịt Bò Úc](https://smartfood.vn/product/thit-bo-uc)
  - TUYỆT ĐỐI KHÔNG tự tạo link cho các danh mục chung chung (VD: không tạo link kiểu [Rau xanh](/product/rau-xanh) hay [Trái cây](/product/trai-cay)) nếu trong kết quả của tool không trả về sản phẩm cụ thể có slug đó. Chỉ gắn link cho sản phẩm thực tế có slug hợp lệ được trả về từ tool "search_products" hoặc "get_recommendations".
- MỌI ĐƠN HÀNG phải dùng định dạng link Markdown TƯƠNG ĐỐI: [Mã đơn: <orderCode>](/order/<id>)
  - Bắt buộc dùng trường "id" (chuỗi 24 ký tự) trả về từ kết quả để gắn link (/order/<id>).
  - Bắt buộc dùng trường "orderCode" (ví dụ: 742962321) để hiển thị tên mã đơn hàng.
  - Tuyệt đối không hiển thị mã ID MongoDB (chuỗi 24 ký tự) dưới dạng text thô, và không hiển thị 2 mã đơn hàng cùng lúc. Chỉ hiển thị duy nhất một định dạng như ví dụ bên dưới.
  - Đúng: [Mã đơn: 742962321](/order/6a23fb32fa534002517923e2)
  - Sai: Mã đơn: 6a23fb32fa534002517923e2 hay hiển thị cả hai mã đơn.
- Hiển thị ĐẦY ĐỦ tất cả sản phẩm trong kết quả, không tự rút gọn.
- Giọng văn tự nhiên, thân thiện, không quảng cáo quá mức.`;

// ─── 4. Main: sendMessage (Agentic Loop) ─────────────────────────────────────
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
    // ══════════════════════════════════════════════════════════
    // BƯỚC 1: Gọi OpenAI lần 1 — AI tự quyết định gọi Tool nào
    // ══════════════════════════════════════════════════════════
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
      // ══════════════════════════════════════════════════════════
      // BƯỚC 2: Thực thi song song tất cả Tool Calls (Promise.all)
      // ══════════════════════════════════════════════════════════
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

      // ══════════════════════════════════════════════════════════
      // BƯỚC 3: Gọi OpenAI lần 2 — Tổng hợp câu trả lời cuối cùng
      // ══════════════════════════════════════════════════════════
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

// ─── clearHistory ─────────────────────────────────────────────────────────────
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

// ─── getHistory ───────────────────────────────────────────────────────────────
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

// ─── invalidateProductCache (no-op — tương thích Controller cũ) ──────────────
const invalidateProductCache = () => {
  // No-op trong kiến trúc Function Calling — không còn dùng snapshot cache
};

// ─── 5. sendMessageStream — SSE Streaming Response ────────────────────────────
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
const sendMessageStream = async ({ message, sessionId, userId = null, res }) => {
  if (!message?.trim()) throw new ApiError(StatusCodes.BAD_REQUEST, "Tin nhắn không được để trống!");
  if (!sessionId) throw new ApiError(StatusCodes.BAD_REQUEST, "SessionId là bắt buộc!");

  // Thiết lập headers SSE
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Tắt buffer trên Nginx
  res.flushHeaders();

  /** Ghi một chunk SSE xuống client */
  const emit = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    // Lấy lịch sử hội thoại
    await chatbotMessageModel.upsertSession({ sessionId, userId });
    const session = await chatbotMessageModel.findSession({ sessionId, userId });
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
      temperature: 0.7,
      max_tokens: 1000,
    });

    const assistantMessage = firstResponse.choices[0].message;
    const toolCalls = assistantMessage.tool_calls;

    if (toolCalls && toolCalls.length > 0) {
      // BƯỚC 2: Thực thi song song tất cả tools
      emit({ type: "tool_start", count: toolCalls.length });
      messages.push(assistantMessage);

      const toolResults = await Promise.all(
        toolCalls.map(async (toolCall) => {
          const output = await executeTool(toolCall, userId);
          return { tool_call_id: toolCall.id, role: "tool", name: toolCall.function.name, content: output };
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
