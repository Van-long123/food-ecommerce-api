import { StatusCodes } from 'http-status-codes'
import { homeService } from '~/services/homeService'

// const getLandingPageData = async (req, res, next) => {
//   try {
//     const result = await homeService.getLandingPageData()
//     res.status(StatusCodes.OK).json(result)
//   } catch (error) {
//     next(error)
//   }
// }

const getHomeAggregate = async (req, res, next) => {
  try {
    const result = await homeService.getHomeAggregate(req.query)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

// const getHomeCategoryProducts = async (req, res, next) => {
//   try {
//     const result = await homeService.getHomeCategoryProducts({
//       slug: req.query.slug,
//       categoryProductLimit: req.query.limit
//     })
//     res.status(StatusCodes.OK).json(result)
//   } catch (error) {
//     next(error)
//   }
// }

// const getHomeBlogs = async (req, res, next) => {
//   try {
//     const result = await homeService.getHomeBlogs({
//       blogLimit: req.query.limit
//     })
//     res.status(StatusCodes.OK).json(result)
//   } catch (error) {
//     next(error)
//   }
// }

export const homeController = {
  // getLandingPageData,
  getHomeAggregate,
  // getHomeCategoryProducts,
  // getHomeBlogs
}
