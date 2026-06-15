import OpenAI from "openai";
import { env } from "~/config/environment";
import { reviewModel } from "~/models/reviewModel";
import { REVIEW_CONFIG } from "~/constants/reviewConfig";
import { GPT_MODEL } from "~/constants/aiConfig";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

//  Layer 1: Regex & Blacklist
const BAD_WORDS = [
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "bastard",
  "damn",
  "wtf",
  "sex",
  "dick",
  "pussy",
  "cunt",
  "motherfucker",
  "fucker",
  "faggot",
  "nigger",
  "dumbass",
  "retard",
  "idiot",
  "jerk",
  "crap",
  "địt",
  "đéo",
  "lồn",
  "cặc",
  "buồi",
  "đụ",
  "đĩ",
  "điếm",
  "chó",
  "ngu",
  "khốn",
  "mất dạy",
  "bẩn",
  "rác",
  "dkm",
  "đkm",
  "vl",
  "vcl",
  "cl",
  "clgt",
  "đmm",
  "vkl",
  "đệt",
  "đcm",
  "dcm",
  "cc",
  "hãm",
  "óc chó",
  "vô học",
  "cút",
  "tởm",
  "tởm lợm",
  "súc vật",
  "mẹ kiếp",
  "khốn nạn",
  "khốn kiếp",
  "vô liêm sỉ",
  "đê tiện",
  "ti tiện",
  "hèn hạ",
  "biến thái",
  "đồ khùng",
  "chó má",
  "vãi",
  "vãi cả",
  "vãi lồng",
  "vãi đái",
  "đm",
  "dm",
  "vcc",
  "đệt mợ",
  "mẹ cha",
  "cha bố",
  "bố láo",
  "chó đẻ",
  "đĩ thõa",
  "đồ tồi",
  "đồ đểu",
  "đểu cáng",
  "lừa đảo",
  "lừa bịp",
  "hút máu",
  "cắt cổ",
  "đần",
  "đần độn",
  "ngu ngốc",
  "ngu lờ",
  "ngu lz",
  "lz",
  "đb",
  "đầu buồi",
  "dbrr",
  "rẻ rách",
  "giẻ rách",
  "hạ đẳng",
  "cẩu tạp chủng",
  "đồ heo",
  "đồ lợn",
  "ngu như bò",
  "ngu như chó",
];

// Tạo Regex gộp từ lúc khởi động server để tối ưu hiệu năng
// Sử dụng các từ được phân cách bằng dấu pipe |
const BAD_WORDS_REGEX = new RegExp(`\\b(${BAD_WORDS.join("|")})\\b`, "i");

const containsBadWords = (text = "") => {
  if (!text) return false;
  const normalized = String(text).toLowerCase();
  return BAD_WORDS_REGEX.test(normalized);
};

const checkLayer1 = (comment) => {
  if (containsBadWords(comment)) {
    return {
      status: reviewModel.REVIEW_STATUSES.REJECTED,
      reason: "Vi phạm tiêu chuẩn cộng đồng (ngôn từ không phù hợp)",
    };
  }
  return null;
};

//  Điều kiện gọi AI (Layer 2)
const shouldCallAI = async (review, user) => {
  const { comment } = review;
  const { MODERATION } = REVIEW_CONFIG;

  // 1. Comment dài
  if (comment && comment.length > MODERATION.MAX_COMMENT_LENGTH) return true;

  // 2. User mới tạo
  if (user && user.createdAt) {
    const userAgeDays =
      (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    if (userAgeDays < MODERATION.NEW_USER_DAYS) return true;
  }

  // 3. User có nhiều report (nhiều review bị reject)
  if (user && user._id) {
    const rejectedCount = await reviewModel.countRejectedByUser(
      user._id.toString(),
    );
    if (rejectedCount >= MODERATION.MAX_REJECTED_REVIEWS) return true;
  }

  // 4. Có hình ảnh -> Gọi AI (Vision)
  const { images } = review;
  const hasImages = Array.isArray(images) && images.length > 0;
  if (hasImages) return true;

  return false;
};

//  Layer 2: AI Moderation (OpenAI)
const checkLayer2AI = async (comment, images) => {
  try {
    const userContent = [
      {
        type: "text",
        text: `Nội dung cần kiểm duyệt: "${comment || "Không có bình luận chữ"}"`,
      },
    ];

    if (Array.isArray(images) && images.length > 0) {
      // Chỉ lấy các url hợp lệ (là chuỗi và không rỗng), giới hạn tối đa 3 ảnh
      const validImages = images.filter(
        (img) => typeof img === "string" && img.trim() !== "",
      );
      const imagesToAnalyze = validImages.slice(0, 3);

      imagesToAnalyze.forEach((imgUrl) => {
        userContent.push({
          type: "image_url",
          image_url: { url: imgUrl },
        });
      });
    }

    const response = await openai.chat.completions.create({
      model: GPT_MODEL,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Bạn là AI kiểm duyệt nội dung review sản phẩm của SmartFood. 
Chỉ đánh giá nội dung review (và hình ảnh nếu có) dựa trên:
- Độ an toàn ngôn từ và hình ảnh (hình ảnh có phù hợp không).
- Spam, quảng cáo.
- Có link bậy, mã QR code lừa đảo.
- Có dấu hiệu lừa đảo, mã độc.
- Có dấu hiệu công kích / toxic, bạo lực, phản cảm.
- Có dấu hiệu review giả.

QUY TẮC PHÂN LOẠI:
1. Chọn "rejected": Nếu ảnh chứa mã vạch, QR code, đường link, văn bản quảng cáo rác, hoặc ảnh không liên quan (vũ khí, máu me, khiêu dâm, bạo lực, logo hãng khác).
2. Chọn "needs_admin_review": Nếu nội dung mỉa mai ngầm, khen chê lẫn lộn (vùng xám), hoặc ảnh quá mờ không nhìn rõ là món gì nhưng không hẳn là độc hại.
3. Chọn "approved": Nếu ảnh chụp đồ ăn bình thường, nội dung trong sáng.

KHÔNG thay đổi nội dung review. KHÔNG suy đoán ngoài dữ liệu đầu vào.

Trả về JSON ĐÚNG cấu trúc sau:
{
  "decision": "approved" | "rejected" | "needs_admin_review",
  "reason": "Viết 1 câu giải thích cụ thể theo đúng ngữ cảnh nội dung/hình ảnh của user (Vd: 'Ảnh chụp một khẩu súng, không phải món ăn', 'Ảnh quá mờ không nhìn rõ được món ăn', 'Có chứa mã QR lạ trong ảnh'). TUYỆT ĐỐI KHÔNG copy lại nguyên văn các quy tắc ở trên.",
  "risk_flags": ["spam", "abuse", "suspicious", "fake", "link", "none"]
}`,
        },
        {
          role: "user",
          content: userContent,
        },
      ],
      temperature: 0.1, //  Đặt độ sáng tạo của AI cực thấp (0.1 gần như là tuyệt đối tuân thủ hướng dẫn)
    });

    const aiResult = JSON.parse(response.choices[0].message.content);
    return {
      status:
        aiResult.decision === "approved"
          ? reviewModel.REVIEW_STATUSES.APPROVED
          : aiResult.decision === "rejected"
            ? reviewModel.REVIEW_STATUSES.REJECTED
            : reviewModel.REVIEW_STATUSES.PENDING, // needs_admin_review => pending
      reason: aiResult.reason || "AI Moderation",
    };
  } catch (error) {
    console.error("[AI Moderation] Error:", error);
    // Fallback: nếu lỗi OpenAI thì đẩy sang Admin (Layer 3)
    return {
      status: reviewModel.REVIEW_STATUSES.PENDING,
      reason: "Lỗi AI kiểm duyệt, cần quản trị viên xem xét",
    };
  }
};

// Main Controller
const evaluateReview = async (review, user) => {
  const { comment, images } = review;
  const hasImages = Array.isArray(images) && images.length > 0;

  // 1. Layer 1: Regex & Blacklist
  const layer1Result = checkLayer1(comment);
  if (layer1Result) return layer1Result;

  // 2. Kiểm tra điều kiện gọi Layer 2
  const needsAI = await shouldCallAI(review, user);
  if (needsAI) {
    const aiResult = await checkLayer2AI(comment, images);
    return aiResult;
  }

  // 3. Mặc định sạch -> Approved
  return { status: reviewModel.REVIEW_STATUSES.APPROVED, reason: null };
};

export const reviewModerationService = {
  evaluateReview,
};
