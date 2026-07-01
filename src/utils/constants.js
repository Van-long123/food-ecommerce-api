import { env } from "~/config/environment";
//Những domain được phép truy cập tới tài nguyên của Server
export const WHITELIST_ORIGIN = [env.WEBSITE_DOMAIN_PROD];
export const WEBSITE_DOMAIN =
  env.BUILD_MODE === "production"
    ? env.WEBSITE_DOMAIN_PROD
    : env.WEBSITE_DOMAIN_DEV;

export const API_DOMAIN =
  env.BUILD_MODE === "production" ? env.API_DOMAIN_PROD : env.API_DOMAIN_DEV;

export const RECOMMENDATION_DOMAIN =
  env.BUILD_MODE === "production"
    ? env.RECOMMENDATION_SERVICE_URL_PROD
    : env.RECOMMENDATION_SERVICE_URL_DEV;

export const GHN_MASTER_DATA_API =
  "https://dev-online-gateway.ghn.vn/shiip/public-api/master-data";
export const GHN_SHIPPING_ORDER_API =
  "https://dev-online-gateway.ghn.vn/shiip/public-api/v2/shipping-order";

export const GHN_HEADERS = {
  Token: env.GHN_TOKEN,
  "Content-Type": "application/json",
};

export const GHN_SHOP_HEADERS = {
  Token: env.GHN_TOKEN,
  ShopId: env.GHN_SHOP_ID,
  "Content-Type": "application/json",
};
