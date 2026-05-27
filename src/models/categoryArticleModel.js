import Joi from "joi";
import { ObjectId } from "mongodb";
import { GET_DB } from "~/config/mongodb";

const CATEGORY_ARTICLE_COLLECTION_NAME = "category_articles";

const CATEGORY_ARTICLE_COLLECTION_SCHEMA = Joi.object({
  category_id: Joi.any().required(),
  article_id: Joi.any().required(),
  createdAt: Joi.date().default(() => new Date()),
  updatedAt: Joi.date().default(null),
});

const validateBeforeCreate = async (data) => {
  return await CATEGORY_ARTICLE_COLLECTION_SCHEMA.validateAsync(data, { abortEarly: false });
};

/**
 * Upsert: nếu đã tồn tại (article_id + category_id) thì update, chưa có thì insert */
const upsert = async ({ article_id, category_id }) => {
  try {
    const filter = {
      article_id: new ObjectId(article_id),
      category_id: new ObjectId(category_id)
    };
    const update = {
      $set: { updatedAt: new Date() },
      $setOnInsert: {
        article_id: new ObjectId(article_id),
        category_id: new ObjectId(category_id),
        createdAt: new Date()
      }
    };
    const result = await GET_DB()
      .collection(CATEGORY_ARTICLE_COLLECTION_NAME)
      .findOneAndUpdate(filter, update, { upsert: true, returnDocument: 'after' });
    return result;
  } catch (error) {
    throw new Error(error);
  }
};

/**
 * Xóa một mapping cụ thể */
const removeOne = async ({ article_id, category_id }) => {
  try {
    return await GET_DB()
      .collection(CATEGORY_ARTICLE_COLLECTION_NAME)
      .deleteOne({
        article_id: new ObjectId(article_id),
        category_id: new ObjectId(category_id)
      });
  } catch (error) {
    throw new Error(error);
  }
};

/**
 * Xóa tất cả categories của một article (dùng khi soft-delete article) */
const deleteAllByArticleId = async (article_id) => {
  try {
    return await GET_DB()
      .collection(CATEGORY_ARTICLE_COLLECTION_NAME)
      .deleteMany({ article_id: new ObjectId(article_id) });
  } catch (error) {
    throw new Error(error);
  }
};

/**
 * Lấy tất cả category_ids của một article */
const findAllByArticleId = async (article_id) => {
  try {
    return await GET_DB()
      .collection(CATEGORY_ARTICLE_COLLECTION_NAME)
      .find({ article_id: new ObjectId(article_id) })
      .toArray();
  } catch (error) {
    throw new Error(error);
  }
};

/**
 * Đồng bộ lại danh sách categories cho article:
 * - Xóa hết mappings cũ không còn trong categoryIds mới
 * - Upsert các mapping mới/cập nhật */
const syncByArticleId = async (article_id, categoryIds = []) => {
  try {
    const aId = new ObjectId(article_id);
    const newCatIds = categoryIds.map(id => new ObjectId(id));

    // Xóa các mapping không còn trong danh sách mới
    if (newCatIds.length > 0) {
      await GET_DB()
        .collection(CATEGORY_ARTICLE_COLLECTION_NAME)
        .deleteMany({ article_id: aId, category_id: { $nin: newCatIds } });
    } else {
      // Nếu list mới rỗng, xóa hết
      await deleteAllByArticleId(article_id);
    }
  } catch (error) {
    throw new Error(error);
  }
};

export const categoryArticleModel = {
  CATEGORY_ARTICLE_COLLECTION_NAME,
  upsert,
  removeOne,
  deleteAllByArticleId,
  findAllByArticleId,
  syncByArticleId
};
