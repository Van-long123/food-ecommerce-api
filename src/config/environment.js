import 'dotenv/config'

export const env = {
  MONGODB_URI: process.env.MONGODB_URI,
  DATABASE_NAME: process.env.DATABASE_NAME,
  APP_NAME: process.env.APP_HOST,
  APP_PORT: process.env.APP_PORT,
  WEBSITE_DOMAIN_DEV: process.env.WEBSITE_DOMAIN_DEV,
  // WEBSITE_DOMAIN_PROD: process.env.WEBSITE_DOMAIN_PROD
}
