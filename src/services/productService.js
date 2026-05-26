import { StatusCodes } from "http-status-codes";
import { productModel } from "~/models/productModel";
import { categoryProductModel } from "~/models/categoryProductModel";
import { categoryModel } from "~/models/categoryModel";
import { reviewModel } from "~/models/reviewModel";
import { orderModel } from "~/models/orderModel";
import { userModel } from "~/models/userModel";
import ApiError from "~/utils/ApiError";
import { slugify } from "~/utils/formatters";
import { parseBool, parseNum } from "~/utils/parsers";
import { CloudinaryProvider } from "~/providers/CloudinaryProvider";
import { evaluateReviewModeration } from "~/utils/reviewModeration";

// ─── Helper: generate unique slug ─────────────────────────────────────────────
const generateUniqueSlug = async (title, providedSlug) => {
  const baseSlug = providedSlug ? slugify(providedSlug) : slugify(title);
  const existing = await productModel.findOneBySlugAny(baseSlug);
  return existing ? `${baseSlug}-${Date.now()}` : baseSlug;
};

/**
 * Đồng bộ categories cho product:
 * - Upsert từng category_id vào category_products
 * - Xác định isPrimary theo primary_category_id
 */
const syncCategories = async (
  productId,
  categoryIds = [],
  primaryCategoryId = null,
) => {
  // Validate: tất cả category phải tồn tại và type=product
  for (const catId of categoryIds) {
    const cat = await categoryModel.findOneById(catId);
    if (!cat || cat.deleted) {
      throw new ApiError(
        StatusCodes.NOT_FOUND,
        `Không tìm thấy category với id: ${catId}`,
      );
    }
    if (cat.type !== categoryModel.CATEGORY_TYPES.PRODUCT) {
      throw new ApiError(
        StatusCodes.UNPROCESSABLE_ENTITY,
        `Category "${cat.title}" có type="${cat.type}", chỉ cho phép category type="product"!`,
      );
    }
  }

  // Xóa các mapping cũ không còn trong danh sách mới
  await categoryProductModel.syncByProductId(productId, categoryIds);

  // Upsert từng mapping
  const promises = categoryIds.map((catId, index) =>
    categoryProductModel.upsert({
      product_id: productId,
      category_id: catId,
    }),
  );
  await Promise.all(promises);
};

// ─── ADMIN: Create ────────────────────────────────────────────────────────────
const createNew = async (reqBody, actorId, files = null) => {
  try {
    // Auto-generate slug nếu không có slug hợp lệ
    const slug = await generateUniqueSlug(reqBody.title, reqBody.slug);

    const actor = await userModel.findOneById(actorId);
    if (!actor)
      throw new ApiError(
        StatusCodes.NOT_FOUND,
        "Đã xảy ra lỗi khi tìm tài khoản!",
      );

    // Auto-calculate position nếu không có hoặc bằng 0
    let position = reqBody.position;
    if (
      position === undefined ||
      position === null ||
      position === 0 ||
      position === "0" ||
      position === ""
    ) {
      const maxPos = await productModel.getMaxPosition();
      position = maxPos + 1;
    } else {
      position = parseNum(position, 0);
    }

    // Xử lý ảnh
    // thumbnail_url: URL cũ (string), thumbnail file: file mới
    let thumbnail = reqBody.thumbnail_url || reqBody.thumbnail || "";

    // images_url: các URL ảnh cũ giữ lại
    let existingImageUrls = reqBody.images_url || [];
    if (!Array.isArray(existingImageUrls))
      existingImageUrls = existingImageUrls ? [existingImageUrls] : [];
    let images = [...existingImageUrls];

    if (files && files.thumbnail && files.thumbnail.length > 0) {
      const file = files.thumbnail[0];
      const uploadResult = await CloudinaryProvider.streamUpload(
        file.buffer,
        "smartfood-products",
        file.mimetype,
      );
      thumbnail = uploadResult.secure_url;
    }

    if (files && files.images && files.images.length > 0) {
      const uploadPromises = files.images.map((file) =>
        CloudinaryProvider.streamUpload(
          file.buffer,
          "smartfood-products",
          file.mimetype,
        ),
      );
      const uploadResults = await Promise.all(uploadPromises);
      images = [...images, ...uploadResults.map((res) => res.secure_url)];
    }

    // Parse tags và category_ids (có thể là string hoặc mảng)
    let tags = reqBody.tags || [];
    if (!Array.isArray(tags)) tags = tags ? [tags] : [];

    let category_ids = reqBody.category_ids || [];
    if (!Array.isArray(category_ids))
      category_ids = category_ids ? [category_ids] : [];

    const newProduct = {
      title: reqBody.title,
      slug,
      description: reqBody.description || "",
      thumbnail,
      images,
      stock: parseNum(reqBody.stock, 0),
      unit: reqBody.unit || "kg",
      price: parseNum(reqBody.price),
      discountPercentage: parseNum(reqBody.discountPercentage, 0),
      originalPrice: parseNum(reqBody.originalPrice) || parseNum(reqBody.price),
      status: reqBody.status || "active",
      featured: parseBool(reqBody.featured),
      isBestPrice: parseBool(reqBody.isBestPrice),
      isOnlineExclusive: parseBool(reqBody.isOnlineExclusive),
      tags,
      ratings: { totalRating: 0, numberOfRatings: 0 },
      position,
      primary_category_id: reqBody.primary_category_id || null,
      createdBy: { account_id: actorId, email: actor.email },
    };

    const created = await productModel.createNew(newProduct);
    const productId = created.insertedId.toString();

    // Đồng bộ categories (nếu có truyền lên)
    const primaryId = reqBody.primary_category_id || category_ids[0] || null;
    if (category_ids.length > 0) {
      await syncCategories(productId, category_ids, primaryId);
    }

    const result = await productModel.getDetails(productId);
    return result;
  } catch (error) {
    throw error;
  }
};

// ─── ADMIN: Get list ──────────────────────────────────────────────────────────
const getListAdmin = async (query) => {
  try {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 10;
    const sortField = query.sortField || "position";
    const sortOrder = query.sortOrder === "desc" ? -1 : 1;

    const queryConditions = [{ deleted: false }];
    if (query.status) queryConditions.push({ status: query.status });
    if (query.featured !== undefined)
      queryConditions.push({ featured: query.featured === "true" });
    if (query.isBestPrice !== undefined)
      queryConditions.push({ isBestPrice: query.isBestPrice === "true" });
    if (query.isOnlineExclusive !== undefined)
      queryConditions.push({
        isOnlineExclusive: query.isOnlineExclusive === "true",
      });
    if (query.keyword) {
      queryConditions.push({
        $or: [
          { title: { $regex: new RegExp(query.keyword, "i") } },
          { slug: { $regex: new RegExp(query.keyword, "i") } },
          { description: { $regex: new RegExp(query.keyword, "i") } },
          { tags: { $elemMatch: { $regex: new RegExp(query.keyword, "i") } } },
        ],
      });
    }
    if (query.minPrice || query.maxPrice) {
      const priceFilter = {};
      if (query.minPrice) priceFilter.$gte = parseFloat(query.minPrice);
      if (query.maxPrice) priceFilter.$lte = parseFloat(query.maxPrice);
      queryConditions.push({ price: priceFilter });
    }
    if (query.primary_category_id)
      queryConditions.push({ primary_category_id: query.primary_category_id });

    const { data, total } = await productModel.getList({
      queryConditions,
      page,
      limit,
      sort: { [sortField]: sortOrder },
    });
    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  } catch (error) {
    throw error;
  }
};

// ─── ADMIN: Get detail by ID (kèm categories từ aggregate) ───────────────────
const getDetailAdmin = async (id) => {
  try {
    const product = await productModel.getDetails(id);
    if (!product)
      throw new ApiError(StatusCodes.NOT_FOUND, "Không tìm thấy sản phẩm!");
    return product;
  } catch (error) {
    throw error;
  }
};

// ─── ADMIN: Update (có thể cập nhật categories cùng lúc) ─────────────────────
const update = async (id, reqBody, actorId, files = null) => {
  try {
    const product = await productModel.findOneById(id);
    if (!product || product.deleted)
      throw new ApiError(StatusCodes.NOT_FOUND, "Không tìm thấy sản phẩm!");

    const actor = await userModel.findOneById(actorId);
    if (!actor)
      throw new ApiError(
        StatusCodes.NOT_FOUND,
        "Không tìm thấy tài khoản người thực hiện!",
      );

    const updateData = {
      ...reqBody,
      updatedAt: new Date(),
    };
    delete updateData.createdBy;
    delete updateData.createdAt;
    delete updateData.category_ids; // xử lý riêng bên dưới
    delete updateData.thumbnail_url; // xử lý riêng bên dưới
    delete updateData.images_url; // xử lý riêng bên dưới

    if (reqBody.featured !== undefined) {
      updateData.featured = parseBool(reqBody.featured);
    }
    if (reqBody.isBestPrice !== undefined) {
      updateData.isBestPrice = parseBool(reqBody.isBestPrice);
    }
    if (reqBody.isOnlineExclusive !== undefined) {
      updateData.isOnlineExclusive = parseBool(reqBody.isOnlineExclusive);
    }
    if (reqBody.stock !== undefined) {
      updateData.stock = parseNum(reqBody.stock, 0);
    }
    if (reqBody.price !== undefined) {
      updateData.price = parseNum(reqBody.price);
    }
    if (reqBody.discountPercentage !== undefined) {
      updateData.discountPercentage = parseNum(reqBody.discountPercentage, 0);
    }
    if (
      reqBody.position !== undefined &&
      reqBody.position !== null &&
      reqBody.position !== ""
    ) {
      updateData.position = parseNum(reqBody.position, 0);
    }
    if (reqBody.originalPrice !== undefined) {
      updateData.originalPrice = parseNum(reqBody.originalPrice);
    }

    // Xử lý thumbnail
    if (files && files.thumbnail && files.thumbnail.length > 0) {
      const file = files.thumbnail[0];
      const uploadResult = await CloudinaryProvider.streamUpload(
        file.buffer,
        "smartfood-products",
        file.mimetype,
      );
      updateData.thumbnail = uploadResult.secure_url;
    } else if (
      reqBody.thumbnail_url !== undefined ||
      reqBody.thumbnail !== undefined
    ) {
      updateData.thumbnail = reqBody.thumbnail_url || reqBody.thumbnail || "";
    }

    // Xử lý images
    if (files && files.images && files.images.length > 0) {
      let existingImageUrls = reqBody.images_url || [];
      if (!Array.isArray(existingImageUrls))
        existingImageUrls = existingImageUrls ? [existingImageUrls] : [];
      let mergedImages = [...existingImageUrls];

      const uploadPromises = files.images.map((file) =>
        CloudinaryProvider.streamUpload(
          file.buffer,
          "smartfood-products",
          file.mimetype,
        ),
      );
      const uploadResults = await Promise.all(uploadPromises);
      updateData.images = [
        ...mergedImages,
        ...uploadResults.map((res) => res.secure_url),
      ];
    } else if (
      reqBody.images_url !== undefined ||
      reqBody.images !== undefined
    ) {
      let existingImageUrls = reqBody.images_url || reqBody.images || [];
      if (!Array.isArray(existingImageUrls))
        existingImageUrls = existingImageUrls ? [existingImageUrls] : [];
      updateData.images = existingImageUrls;
    }

    // Parse tags
    if (reqBody.tags !== undefined) {
      let tags = reqBody.tags || [];
      if (!Array.isArray(tags)) tags = tags ? [tags] : [];
      updateData.tags = tags;
    }

    // Slug
    if (reqBody.title && !reqBody.slug) {
      updateData.slug = await generateUniqueSlug(reqBody.title, null);
    } else if (reqBody.slug) {
      const slugCandidate = slugify(reqBody.slug);
      const existing = await productModel.findOneBySlugAny(slugCandidate);
      updateData.slug =
        existing && existing._id.toString() !== id
          ? `${slugCandidate}-${Date.now()}`
          : slugCandidate;
    }

    await productModel.pushUpdatedBy(id, actorId, actor.email);
    await productModel.update(id, updateData);

    // Đồng bộ categories nếu có truyền category_ids
    if (reqBody.category_ids !== undefined) {
      let category_ids = reqBody.category_ids || [];
      if (!Array.isArray(category_ids))
        category_ids = category_ids ? [category_ids] : [];
      const primaryId = reqBody.primary_category_id || category_ids[0] || null;
      await syncCategories(id, category_ids, primaryId);
    }

    const result = await productModel.getDetails(id);
    return result;
  } catch (error) {
    throw error;
  }
};

// ─── ADMIN: Thêm product vào một category ─────────────────────────────────────
const addCategory = async (productId, reqBody) => {
  try {
    const product = await productModel.findOneById(productId);
    if (!product || product.deleted)
      throw new ApiError(StatusCodes.NOT_FOUND, "Không tìm thấy sản phẩm!");

    const category = await categoryModel.findOneById(reqBody.category_id);
    if (!category || category.deleted)
      throw new ApiError(StatusCodes.NOT_FOUND, "Không tìm thấy category!");
    if (category.type !== categoryModel.CATEGORY_TYPES.PRODUCT) {
      throw new ApiError(
        StatusCodes.UNPROCESSABLE_ENTITY,
        `Category này có type="${category.type}", chỉ cho phép category type="product"!`,
      );
    }

    await categoryProductModel.upsert({
      product_id: productId,
      category_id: reqBody.category_id,
    });

    // Nếu set làm primary → cập nhật primary_category_id trên product
    if (reqBody.isPrimary) {
      await productModel.update(productId, {
        primary_category_id: reqBody.category_id,
        updatedAt: new Date(),
      });
    }

    return await productModel.getDetails(productId);
  } catch (error) {
    throw error;
  }
};

// ─── ADMIN: Xóa product khỏi một category ─────────────────────────────────────
const removeCategory = async (productId, categoryId) => {
  try {
    const product = await productModel.findOneById(productId);
    if (!product || product.deleted)
      throw new ApiError(StatusCodes.NOT_FOUND, "Không tìm thấy sản phẩm!");

    await categoryProductModel.removeOne({
      product_id: productId,
      category_id: categoryId,
    });

    // Nếu category bị xóa là primary → reset primary_category_id
    if (product.primary_category_id === categoryId) {
      await productModel.update(productId, {
        primary_category_id: null,
        updatedAt: new Date(),
      });
    }

    return await productModel.getDetails(productId);
  } catch (error) {
    throw error;
  }
};

// ─── ADMIN: Soft Delete ───────────────────────────────────────────────────────
const softDelete = async (id, actorId) => {
  try {
    const product = await productModel.findOneById(id);
    if (!product || product.deleted)
      throw new ApiError(StatusCodes.NOT_FOUND, "Không tìm thấy sản phẩm!");

    const actor = await userModel.findOneById(actorId);
    if (!actor)
      throw new ApiError(
        StatusCodes.NOT_FOUND,
        "Không tìm thấy tài khoản người thực hiện!",
      );

    // Xoá mềm tất cả category mappings
    // await categoryProductModel.deleteAllByProductId(id);
    const result = await productModel.softDelete(id, actorId, actor.email);
    return result;
  } catch (error) {
    throw error;
  }
};

const bulkUpdateStatusAdmin = async ({ product_ids = [], status }) => {
  try {
    if (!Array.isArray(product_ids) || product_ids.length === 0) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "Danh sách sản phẩm không hợp lệ!",
      );
    }

    const result = await productModel.updateManyStatus(product_ids, status);
    return { updatedCount: result?.modifiedCount || 0 };
  } catch (error) {
    throw error;
  }
};

const bulkDeleteAdmin = async ({ product_ids = [] }, actorId) => {
  try {
    if (!Array.isArray(product_ids) || product_ids.length === 0) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "Danh sách sản phẩm không hợp lệ!",
      );
    }

    const actor = await userModel.findOneById(actorId);
    if (!actor) {
      throw new ApiError(
        StatusCodes.NOT_FOUND,
        "Không tìm thấy tài khoản người thực hiện!",
      );
    }

    const result = await productModel.softDeleteMany(
      product_ids,
      actorId,
      actor.email,
    );

    return { deletedCount: result?.modifiedCount || 0 };
  } catch (error) {
    throw error;
  }
};

// ─── CLIENT: Get list ─────────────────────────────────────────────────────────
const getListClient = async (query) => {
  try {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 10;
    const sortField = query.sortField || "position";
    const sortOrder = query.sortOrder === "desc" ? -1 : 1;

    const queryConditions = [{ deleted: false }, { status: "active" }];
    if (query.featured !== undefined)
      queryConditions.push({ featured: query.featured === "true" });
    if (query.isBestPrice !== undefined)
      queryConditions.push({ isBestPrice: query.isBestPrice === "true" });
    if (query.isOnlineExclusive !== undefined)
      queryConditions.push({
        isOnlineExclusive: query.isOnlineExclusive === "true",
      });
    if (query.keyword) {
      queryConditions.push({
        $or: [
          { title: { $regex: new RegExp(query.keyword, "i") } },
          { slug: { $regex: new RegExp(query.keyword, "i") } },
          { description: { $regex: new RegExp(query.keyword, "i") } },
          { tags: { $elemMatch: { $regex: new RegExp(query.keyword, "i") } } },
        ],
      });
    }
    if (query.minPrice || query.maxPrice) {
      const priceFilter = {};
      if (query.minPrice) priceFilter.$gte = parseFloat(query.minPrice);
      if (query.maxPrice) priceFilter.$lte = parseFloat(query.maxPrice);
      queryConditions.push({ price: priceFilter });
    }
    if (query.primary_category_id)
      queryConditions.push({ primary_category_id: query.primary_category_id });

    const { data, total } = await productModel.getList({
      queryConditions,
      page,
      limit,
      sort: { [sortField]: sortOrder },
    });
    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  } catch (error) {
    throw error;
  }
};

// ─── CLIENT: Get detail by slug ───────────────────────────────────────────────
const getDetailClient = async (slug) => {
  try {
    const product = await productModel.getDetails(slug);
    if (!product)
      throw new ApiError(StatusCodes.NOT_FOUND, "Không tìm thấy sản phẩm!");
    return product;
  } catch (error) {
    throw error;
  }
};

const createReviewClient = async (slug, reqBody, userId) => {
  try {
    const product = await productModel.findOneBySlugOrId(slug);
    if (!product)
      throw new ApiError(StatusCodes.NOT_FOUND, "Không tìm thấy sản phẩm!");

    const deliveredOrderIds = await orderModel.listDeliveredOrderIdsByProduct(
      userId,
      product._id.toString(),
    );
    if (!deliveredOrderIds.length) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "Bạn chỉ được đánh giá sản phẩm sau khi đã mua hàng thành công!",
      );
    }

    const existingReview = await reviewModel.findOneByUserAndProduct(
      product._id.toString(),
      userId,
    );
    const reviewedOrderIds = Array.isArray(existingReview?.orderIds)
      ? existingReview.orderIds.map((id) => id.toString())
      : [];
    const targetOrderId =
      deliveredOrderIds.find((id) => !reviewedOrderIds.includes(id)) || null;

    if (!targetOrderId) {
      throw new ApiError(
        StatusCodes.BAD_REQUEST,
        "Bạn đã đánh giá sản phẩm này. Hãy mua lại sản phẩm để có thể cập nhật đánh giá mới!",
      );
    }

    const normalizedReview = {
      rating: reqBody.rating,
      comment: reqBody.comment || "",
      images: Array.isArray(reqBody.images) ? reqBody.images : [],
    };

    const moderationResult = evaluateReviewModeration(normalizedReview);
    const nextStatus = moderationResult.status;
    const rejectReason = moderationResult.reason;

    if (existingReview) {
      await reviewModel.updateReview(
        existingReview._id.toString(),
        {
          rating: normalizedReview.rating,
          comment: normalizedReview.comment,
          images: normalizedReview.images,
          status: nextStatus,
          rejectReason: rejectReason,
        },
        targetOrderId,
      );
    } else {
      const newReview = {
        productId: product._id.toString(),
        userId,
        rating: normalizedReview.rating,
        comment: normalizedReview.comment,
        images: normalizedReview.images,
        orderIds: [targetOrderId],
        status: nextStatus,
        rejectReason: rejectReason,
        createdAt: new Date(),
      };

      await reviewModel.createNew(newReview);
    }

    const shouldSyncRatings =
      nextStatus === reviewModel.REVIEW_STATUSES.APPROVED ||
      existingReview?.status === reviewModel.REVIEW_STATUSES.APPROVED;

    const ratings = shouldSyncRatings
      ? await productModel.syncRatingsFromReviews(product._id.toString())
      : null;

    return {
      message: "Đánh giá sản phẩm thành công!",
      status: nextStatus,
      ratings,
    };
  } catch (error) {
    throw error;
  }
};

const getReviewEligibilityClient = async (slug, userId) => {
  try {
    const product = await productModel.findOneBySlugOrId(slug);
    if (!product)
      throw new ApiError(StatusCodes.NOT_FOUND, "Không tìm thấy sản phẩm!");

    const deliveredOrderIds = await orderModel.listDeliveredOrderIdsByProduct(
      userId,
      product._id.toString(),
    );
    if (!deliveredOrderIds.length) {
      return { isEligible: false, existingReview: null, targetOrderId: null };
    }

    const existingReview = await reviewModel.findOneByUserAndProduct(
      product._id.toString(),
      userId,
    );
    const reviewedOrderIds = Array.isArray(existingReview?.orderIds)
      ? existingReview.orderIds.map((id) => id.toString())
      : [];
    const targetOrderId =
      deliveredOrderIds.find((id) => !reviewedOrderIds.includes(id)) || null;

    return {
      isEligible: Boolean(targetOrderId),
      existingReview: existingReview || null,
      targetOrderId,
    };
  } catch (error) {
    throw error;
  }
};

export const productService = {
  createNew,
  getListAdmin,
  getDetailAdmin,
  update,
  addCategory,
  removeCategory,
  softDelete,
  bulkUpdateStatusAdmin,
  bulkDeleteAdmin,
  getListClient,
  getDetailClient,
  createReviewClient,
  getReviewEligibilityClient,
};
