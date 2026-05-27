import { createHmac } from "node:crypto";

/**
 * Sắp xếp các key của object theo thứ tự bảng chữ cái.
 * PayOS yêu cầu các field phải được sắp xếp alphabetically trước khi ký. */
export function sortObjDataByKey(object) {
  const orderedObject = Object.keys(object)
    .sort()
    .reduce((obj, key) => {
      obj[key] = object[key];
      return obj;
    }, {});
  return orderedObject;
}

/**
 * Chuyển đổi object thành query string chuẩn PayOS.
 * Xử lý đặc biệt: Array → JSON.stringify với các phần tử được sort by key,
 * null/undefined → chuỗi rỗng ''. */
export function convertObjToQueryStr(object) {
  return Object.keys(object)
    .filter((key) => object[key] !== undefined)
    .map((key) => {
      let value = object[key];

      // Sort nested array elements
      if (value && Array.isArray(value)) {
        value = JSON.stringify(value.map((val) => sortObjDataByKey(val)));
      }
      // Set empty string if null / undefined
      if ([null, undefined, "undefined", "null"].includes(value)) {
        value = "";
      }

      return `${key}=${value}`;
    })
    .join("&");
}

/**
 * Tạo chữ ký số HMAC-SHA256 từ payload PayOS.
 * data - Payload cần ký (sẽ được sort key trước)
 * checksumKey - PAYOS_CHECKSUM_KEY từ env
 * return Chữ ký hex */
export function generateSignature(data, checksumKey) {
  const sortedDataByKey = sortObjDataByKey(data);
  const dataQueryStr = convertObjToQueryStr(sortedDataByKey);
  const signature = createHmac("sha256", checksumKey)
    .update(dataQueryStr)
    .digest("hex");
  return signature;
}

/**
 * Xác thực chữ ký số từ Webhook PayOS.
 * webhookData - body.data từ PayOS
 * webhookSignature - body.signature từ PayOS
 * checksumKey - PAYOS_CHECKSUM_KEY từ env
 * return true nếu chữ ký hợp lệ */
export function isValidData(webhookData, webhookSignature, checksumKey) {
  const expectedSignature = generateSignature(webhookData, checksumKey);
  return expectedSignature === webhookSignature;
}
