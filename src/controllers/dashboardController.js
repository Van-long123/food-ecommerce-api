import { StatusCodes } from 'http-status-codes'
import { dashboardService } from '~/services/dashboardService'

const getDashboardOverview = async (req, res, next) => {
  try {
    const result = await dashboardService.getDashboardOverview()

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Lấy dữ liệu tổng quan dashboard thành công',
      data: result
    })
  } catch (error) {
    next(error)
  }
}

const getExportData = async (req, res, next) => {
  try {
    const result = await dashboardService.getExportData()

    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Lấy dữ liệu xuất báo cáo thành công',
      data: result
    })
  } catch (error) {
    next(error)
  }
}

export const dashboardController = {
  getDashboardOverview,
  getExportData
}
