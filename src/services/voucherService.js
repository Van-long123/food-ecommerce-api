import { StatusCodes } from "http-status-codes";
import ApiError from "~/utils/ApiError";
import { voucherModel } from "~/models/voucherModel";
import { voucherUsageModel } from "~/models/voucherUsageModel";
import { voucherValidationService } from "~/services/voucherValidationService";
import { userModel } from "~/models/userModel";

const parsePositiveInt = (val, defaultVal) => {
  const n = parseInt(val);
  return Number.isFinite(n) && n > 0 ? n : defaultVal;
};

const serializeObjectId = (value) => {
  if (!value) return null;
  return typeof value === "string" ? value : value.toString();
};

const serializeVoucher = (voucher) => {
  if (!voucher) return null;

  return {
    ...voucher,
    _id: serializeObjectId(voucher._id),
    applyForIds: Array.isArray(voucher.applyForIds)
      ? voucher.applyForIds.map(serializeObjectId)
      : [],
    createdBy: voucher.createdBy
      ? {
          ...voucher.createdBy,
          account_id: serializeObjectId(voucher.createdBy.account_id),
        }
      : voucher.createdBy,
    deletedBy: voucher.deletedBy
      ? {
          ...voucher.deletedBy,
          account_id: serializeObjectId(voucher.deletedBy.account_id),
        }
      : voucher.deletedBy,
    updatedBy: Array.isArray(voucher.updatedBy)
      ? voucher.updatedBy.map((entry) => ({
          ...entry,
          account_id: serializeObjectId(entry.account_id),
        }))
      : [],
  };
};

const normalizeVoucherCreatePayload = (reqBody, actorId, actorEmail) => ({
  code: String(reqBody.code || "")
    .toUpperCase()
    .trim(),
  name: reqBody.name,
  description: reqBody.description || "",
  type: reqBody.type,
  discountValue: Number(reqBody.discountValue),
  maxDiscountAmount:
    reqBody.maxDiscountAmount != null
      ? Number(reqBody.maxDiscountAmount)
      : null,
  minOrderValue: Number(reqBody.minOrderValue || 0),
  applyFor: reqBody.applyFor || voucherModel.VOUCHER_APPLY_FOR.ALL,
  applyForIds: Array.isArray(reqBody.applyForIds) ? reqBody.applyForIds : [],
  startDate: new Date(reqBody.startDate),
  endDate: new Date(reqBody.endDate),
  status: reqBody.status || voucherModel.VOUCHER_STATUSES.ACTIVE,
  quantity: Number(reqBody.quantity),
  usedCount: 0,
  usageLimitPerUser: Number(reqBody.usageLimitPerUser || 1),
  isFeatured: Boolean(reqBody.isFeatured),
  createdBy: { account_id: actorId, email: actorEmail },
});

const normalizeVoucherUpdatePayload = (reqBody) => {
  const updateData = { ...reqBody };

  delete updateData._id;
  delete updateData.createdBy;
  delete updateData.deletedBy;
  delete updateData.deleted;
  delete updateData.deletedAt;
  delete updateData.usedCount;
  delete updateData.updatedBy;

  if (updateData.code) {
    updateData.code = String(updateData.code).toUpperCase().trim();
  }

  if (updateData.startDate) {
    updateData.startDate = new Date(updateData.startDate);
  }

  if (updateData.endDate) {
    updateData.endDate = new Date(updateData.endDate);
  }

  if (updateData.maxDiscountAmount != null) {
    updateData.maxDiscountAmount = Number(updateData.maxDiscountAmount);
  }

  if (updateData.discountValue != null) {
    updateData.discountValue = Number(updateData.discountValue);
  }

  if (updateData.minOrderValue != null) {
    updateData.minOrderValue = Number(updateData.minOrderValue);
  }

  if (updateData.quantity != null) {
    updateData.quantity = Number(updateData.quantity);
  }

  if (updateData.usageLimitPerUser != null) {
    updateData.usageLimitPerUser = Number(updateData.usageLimitPerUser);
  }

  if (Array.isArray(updateData.applyForIds)) {
    updateData.applyForIds = updateData.applyForIds.filter(Boolean);
  }

  return updateData;
};

// ─── CLIENT ───────────────────────────────────────────────────────────────────

/**
 * Danh sách vouchers active cho client xem (không cần đăng nhập)
 * Query params: type, isFeatured, page, limit
 */
const getListClient = async (query, accountId = null) => {
  const page = parsePositiveInt(query.page, 1);
  const limit = parsePositiveInt(query.limit, 100);

  const now = new Date();
  const queryConditions = [
    { deleted: false },
    { status: voucherModel.VOUCHER_STATUSES.ACTIVE },
    { startDate: { $lte: now } },
    { endDate: { $gt: now } },
  ];

  if (
    query.type &&
    Object.values(voucherModel.VOUCHER_TYPES).includes(query.type)
  ) {
    queryConditions.push({ type: query.type });
  }

  if (query.isFeatured !== undefined) {
    queryConditions.push({ isFeatured: query.isFeatured === "true" });
  }

  let { data, total } = await voucherModel.getList({
    queryConditions,
    page,
    limit,
    sort: { isFeatured: -1, endDate: 1 },
  });

  // Nếu user đã đăng nhập, lọc bỏ những voucher user đã sử dụng
  if (accountId) {
    const filteredData = [];
    for (const voucher of data) {
      const usageCount = await voucherUsageModel.countUsageByUser(
        voucher._id,
        accountId,
      );
      const usageLimit = voucher.usageLimitPerUser || 1;
      if (usageCount < usageLimit) {
        filteredData.push(voucher);
      }
    }
    data = filteredData;
    total = data.length; // Cập nhật lại total sau khi lọc
  }

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

/**
 * Validate mã giảm giá
 * Body: { code, orderValue, items, shippingFee }
 */
const validateVoucher = async (
  { code, orderValue, items = [], shippingFee = 0 },
  accountId = null,
) => {
  return await voucherValidationService.validateVoucherForCheckout(
    { code, orderValue, items, shippingFee },
    accountId,
  );
};

// ─── ADMIN ────────────────────────────────────────────────────────────────────

const getListAdmin = async (query) => {
  const page = parsePositiveInt(query.page, 1);
  const limit = parsePositiveInt(query.perPage || query.limit, 10);
  const queryConditions = [{ deleted: false }];

  if (
    query.status &&
    Object.values(voucherModel.VOUCHER_STATUSES).includes(query.status)
  ) {
    queryConditions.push({ status: query.status });
  }

  if (
    query.type &&
    Object.values(voucherModel.VOUCHER_TYPES).includes(query.type)
  ) {
    queryConditions.push({ type: query.type });
  }

  if (query.keyword) {
    queryConditions.push({
      $or: [
        { code: { $regex: new RegExp(query.keyword, "i") } },
        { name: { $regex: new RegExp(query.keyword, "i") } },
      ],
    });
  }

  const allowedSortFields = [
    "code",
    "name",
    "type",
    "discountValue",
    "minOrderValue",
    "quantity",
    "usedCount",
    "startDate",
    "endDate",
    "status",
    "isFeatured",
    "createdAt",
    "updatedAt",
  ];
  const sortField = allowedSortFields.includes(query.sortField)
    ? query.sortField
    : "createdAt";
  const sortOrder = query.sortOrder === "asc" ? 1 : -1;

  const { data, total } = await voucherModel.getList({
    queryConditions,
    page,
    limit,
    sort: { [sortField]: sortOrder },
  });
  return {
    data: data.map(serializeVoucher),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const createNew = async (reqBody, actorId) => {
  const actor = await userModel.findOneById(actorId);
  if (!actor)
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "Không tìm thấy tài khoản người thực hiện!",
    );

  const data = normalizeVoucherCreatePayload(reqBody, actorId, actor.email);
  const existing = await voucherModel.findOneByCode(data.code);
  if (existing)
    throw new ApiError(
      StatusCodes.CONFLICT,
      `Mã voucher "${data.code}" đã tồn tại!`,
    );

  const created = await voucherModel.createNew(data);
  const newVoucher = await voucherModel.findOneById(created.insertedId);
  return serializeVoucher(newVoucher);
};

const updateVoucher = async (id, reqBody, actorId) => {
  const voucher = await voucherModel.findOneById(id);
  if (!voucher || voucher.deleted)
    throw new ApiError(StatusCodes.NOT_FOUND, "Không tìm thấy voucher!");

  const actor = await userModel.findOneById(actorId);
  if (!actor)
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "Không tìm thấy tài khoản người thực hiện!",
    );

  const updateData = normalizeVoucherUpdatePayload(reqBody);

  if (updateData.code) {
    const existing = await voucherModel.findOneByCode(updateData.code);
    if (existing && String(existing._id) !== String(id)) {
      throw new ApiError(
        StatusCodes.CONFLICT,
        `Mã voucher "${updateData.code}" đã tồn tại!`,
      );
    }
  }

  await voucherModel.pushUpdatedBy(id, actorId, actor.email);
  const updated = await voucherModel.update(id, updateData);
  return serializeVoucher(updated || null);
};

const deleteVoucher = async (id, actorId) => {
  const voucher = await voucherModel.findOneById(id);
  if (!voucher || voucher.deleted)
    throw new ApiError(StatusCodes.NOT_FOUND, "Không tìm thấy voucher!");

  const actor = await userModel.findOneById(actorId);
  if (!actor)
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "Không tìm thấy tài khoản người thực hiện!",
    );

  return await voucherModel.softDelete(id, actorId, actor.email);
};

const getDetailAdmin = async (id) => {
  const voucher = await voucherModel.findOneById(id);
  if (!voucher || voucher.deleted) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Không tìm thấy voucher!");
  }

  return serializeVoucher(voucher);
};

const bulkUpdateStatusAdmin = async ({ voucher_ids = [], status }) => {
  const validIds = Array.isArray(voucher_ids)
    ? voucher_ids.filter(Boolean)
    : [];
  if (validIds.length === 0) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Danh sách voucher không hợp lệ!",
    );
  }

  if (!Object.values(voucherModel.VOUCHER_STATUSES).includes(status)) {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Trạng thái không hợp lệ!");
  }

  let updatedCount = 0;
  for (const voucherId of validIds) {
    const updated = await voucherModel.update(voucherId, { status });
    if (updated?.value) updatedCount += 1;
  }

  return { updatedCount };
};

const bulkDeleteAdmin = async ({ voucher_ids = [] }, actorId) => {
  const validIds = Array.isArray(voucher_ids)
    ? voucher_ids.filter(Boolean)
    : [];
  if (validIds.length === 0) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Danh sách voucher không hợp lệ!",
    );
  }

  const actor = await userModel.findOneById(actorId);
  if (!actor)
    throw new ApiError(
      StatusCodes.NOT_FOUND,
      "Không tìm thấy tài khoản người thực hiện!",
    );

  let deletedCount = 0;
  for (const voucherId of validIds) {
    const result = await voucherModel.softDelete(
      voucherId,
      actorId,
      actor.email,
    );
    if (result?.value) deletedCount += 1;
  }

  return { deletedCount };
};

export const voucherService = {
  getListClient,
  validateVoucher,
  getListAdmin,
  createNew,
  updateVoucher,
  deleteVoucher,
  getDetailAdmin,
  bulkUpdateStatusAdmin,
  bulkDeleteAdmin,
  serializeVoucher,
};
