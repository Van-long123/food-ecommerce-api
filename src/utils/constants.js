import { env } from '~/config/environment'
//Những domain được phép truy cập tới tài nguyên của Server
export const WHITELIST_ORIGIN = [
]

export const WEBSITE_DOMAIN = env.BUILD_MODE === 'production'
	? env.WEBSITE_DOMAIN_PROD
	: env.WEBSITE_DOMAIN_DEV

export const API_DOMAIN = env.BUILD_MODE === 'production'
	? env.API_DOMAIN_PROD
	: env.API_DOMAIN_DEV