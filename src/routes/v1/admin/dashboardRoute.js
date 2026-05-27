import express from 'express'
import { dashboardController } from '~/controllers/dashboardController'

const Router = express.Router()

Router.get('/overview', dashboardController.getDashboardOverview)
Router.get('/export', dashboardController.getExportData)

export const adminDashboardRoute = Router
