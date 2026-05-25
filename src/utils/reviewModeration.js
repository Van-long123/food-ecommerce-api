import { reviewModel } from "~/models/reviewModel";

const BAD_WORDS = [
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "bastard",
  "damn",
  "wtf",
  "sex",
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
];

const containsBadWords = (text = "") => {
  if (!text) return false;
  const normalized = String(text).toLowerCase();
  //Kiểm tra xem có từ nào trong mảng BAD_WORDS xuất hiện trong văn bản không
  return BAD_WORDS.some((word) =>
    new RegExp(`\\b${word}\\b`, "i").test(normalized),
  );
};

export const evaluateReviewModeration = ({ rating, comment, images }) => {
  const hasImages = Array.isArray(images) && images.length > 0;
  const hasBadWords = containsBadWords(comment);

  if (hasBadWords) {
    return {
      status: reviewModel.REVIEW_STATUSES.REJECTED,
      reason: "Vi phạm tiêu chuẩn cộng đồng (ngôn từ không phù hợp)",
    };
  }

  if (hasImages) {
    return {
      status: reviewModel.REVIEW_STATUSES.PENDING,
      reason: "Đánh giá có hình ảnh, đang chờ quản trị viên duyệt",
    };
  }

  // Không có từ cấm, không có hình ảnh => auto approve bất kể số sao
  return { status: reviewModel.REVIEW_STATUSES.APPROVED, reason: null };
};
