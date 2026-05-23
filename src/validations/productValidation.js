import Joi from "joi";
import { StatusCodes } from "http-status-codes";
import ApiError from "~/utils/ApiError";

const PRODUCT_UNITS = [
  "kg",
  "g",
  "hộp",
  "chai",
  "gói",
  "túi",
  "cái",
  "lốc",
  "combo",
];

const createNew = async (req, res, next) => {
  const schema = Joi.object({
    title: Joi.string().required().trim().strict(),
    slug: Joi.string().optional().trim().strict(),
    description: Joi.string().optional().allow(""),
    thumbnail: Joi.string().optional().allow(""),
    images: Joi.array().items(Joi.string()).optional().single(),
    stock: Joi.number().integer().min(0).optional(),
    unit: Joi.string()
      .valid(...PRODUCT_UNITS)
      .optional(),
    price: Joi.number().min(0).required(),
    discountPercentage: Joi.number().min(0).max(100).optional(),
    originalPrice: Joi.number().min(0).optional(),
    status: Joi.string().valid("active", "inactive").optional(),
    featured: Joi.boolean().optional(),
    isBestPrice: Joi.boolean().optional(),
    isOnlineExclusive: Joi.boolean().optional(),
    tags: Joi.array().items(Joi.string()).optional().single(),
    ratings: Joi.object({
      totalRating: Joi.number().optional(),
      numberOfRatings: Joi.number().integer().optional(),
    }).optional(),
    position: Joi.number().integer().optional(),
    primary_category_id: Joi.alternatives()
      .try(Joi.string(), Joi.allow(null))
      .optional(),
    category_ids: Joi.array().items(Joi.string()).optional().single(),
  });

  try {
    await schema.validateAsync(req.body, {
      abortEarly: false,
      allowUnknown: true,
    });
    next();
  } catch (error) {
    next(new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, error.message));
  }
};

const update = async (req, res, next) => {
  const schema = Joi.object({
    title: Joi.string().optional().trim().strict(),
    slug: Joi.string().optional().trim().strict(),
    description: Joi.string().optional().allow(""),
    thumbnail: Joi.string().optional().allow(""),
    images: Joi.array().items(Joi.string()).optional().single(),
    stock: Joi.number().integer().min(0).optional(),
    unit: Joi.string()
      .valid(...PRODUCT_UNITS)
      .optional(),
    price: Joi.number().min(0).optional(),
    discountPercentage: Joi.number().min(0).max(100).optional(),
    originalPrice: Joi.number().min(0).optional(),
    status: Joi.string().valid("active", "inactive").optional(),
    featured: Joi.boolean().optional(),
    isBestPrice: Joi.boolean().optional(),
    isOnlineExclusive: Joi.boolean().optional(),
    tags: Joi.array().items(Joi.string()).optional().single(),
    ratings: Joi.object({
      totalRating: Joi.number().optional(),
      numberOfRatings: Joi.number().integer().optional(),
    }).optional(),
    position: Joi.number().integer().optional(),
    primary_category_id: Joi.alternatives()
      .try(Joi.string(), Joi.allow(null))
      .optional(),
    category_ids: Joi.array().items(Joi.string()).optional().single(),
  });

  try {
    await schema.validateAsync(req.body, {
      abortEarly: false,
      allowUnknown: true,
    });
    next();
  } catch (error) {
    next(new ApiError(StatusCodes.UNPROCESSABLE_ENTITY, error.message));
  }
};

export const productValidation = { createNew, update };
