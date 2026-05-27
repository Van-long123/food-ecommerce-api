import express from "express";
import { authMiddleware } from "~/middlewares/authMiddleware";
import { productController } from "~/controllers/productController";
import { productValidation } from "~/validations/productValidation";
import { multerUploadMiddleware } from "~/middlewares/multerUploadMiddleware";
import { PERMISSIONS } from "~/constants/permissions";

const Router = express.Router();

Router.use(authMiddleware.isAuthorized, authMiddleware.isAdmin);

const productUpload = multerUploadMiddleware.upload.fields([
  { name: "thumbnail", maxCount: 1 },
  { name: "images", maxCount: 10 },
]);

// GET  /v1/admin/products      → Danh sách (filter, search, pagination)
// POST /v1/admin/products      → Tạo mới (có thể kèm category_ids[])
Router.route("/")
  .get(
    authMiddleware.requirePermission(PERMISSIONS.PRODUCTS.VIEW),
    productController.getListAdmin,
  )
  .post(
    authMiddleware.requirePermission(PERMISSIONS.PRODUCTS.CREATE),
    productUpload,
    productValidation.createNew,
    productController.createNew,
  );

Router.route('/bulk-status')
  .put(
    authMiddleware.requirePermission(PERMISSIONS.PRODUCTS.EDIT),
    productValidation.adminBulkStatus,
    productController.bulkUpdateStatusAdmin
  )

Router.route('/bulk')
  .delete(
    authMiddleware.requirePermission(PERMISSIONS.PRODUCTS.DELETE),
    productValidation.adminBulkDelete,
    productController.bulkDeleteAdmin
  )

// GET    /v1/admin/products/:id → Chi tiết (kèm primary_category + categories)
// PUT    /v1/admin/products/:id → Cập nhật (có thể kèm category_ids[])
// DELETE /v1/admin/products/:id → Xoá mềm (tự xoá category_products)
Router.route("/:id")
  .get(
    authMiddleware.requirePermission(PERMISSIONS.PRODUCTS.VIEW),
    productController.getDetailAdmin,
  )
  .put(
    authMiddleware.requirePermission(PERMISSIONS.PRODUCTS.EDIT),
    productUpload,
    productValidation.update,
    productController.update,
  )
  .delete(
    authMiddleware.requirePermission(PERMISSIONS.PRODUCTS.DELETE),
    productController.softDelete,
  );

// POST   /v1/admin/products/:id/categories          → Gán vào 1 category
// DELETE /v1/admin/products/:id/categories/:catId   → Xóa khỏi 1 category
Router.route(":id/categories").post(
  authMiddleware.requirePermission(PERMISSIONS.PRODUCTS.EDIT),
  productController.addCategory,
);

Router.route(":id/categories/:catId").delete(
  authMiddleware.requirePermission(PERMISSIONS.PRODUCTS.EDIT),
  productController.removeCategory,
);

export const adminProductRoute = Router;
