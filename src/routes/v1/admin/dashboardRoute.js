import express from 'express'
import { dashboardController } from '~/controllers/dashboardController'
import { authMiddleware } from '~/middlewares/authMiddleware'
import { PERMISSIONS } from '~/constants/permissions'

const Router = express.Router()

Router.get(
	'/overview',
	authMiddleware.requirePermission(PERMISSIONS.DASHBOARD.VIEW),
	dashboardController.getDashboardOverview
)
Router.get(
	'/export',
	authMiddleware.requirePermission(PERMISSIONS.DASHBOARD.VIEW),
	dashboardController.getExportData
)

export const adminDashboardRoute = Router
