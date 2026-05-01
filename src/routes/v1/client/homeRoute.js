import express from 'express'
import { homeController } from '~/controllers/homeController'

const Router = express.Router()

// Backward compatible endpoint
// Router.route('/').get(homeController.getLandingPageData)

// Production Home APIs
Router.route('/aggregate').get(homeController.getHomeAggregate)
Router.route('/campaigns/:slug/products').get(homeController.getCampaignProducts)
// Router.route('/category-products').get(homeController.getHomeCategoryProducts)
// Router.route('/blogs').get(homeController.getHomeBlogs)

export const homeRoute = Router
