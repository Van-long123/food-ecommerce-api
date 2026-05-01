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

const getCampaignProducts = async (req, res, next) => {
  try {
    const { slug } = req.params
    const { page, limit } = req.query
    const result = await homeService.getCampaignProductsBySlug(slug, { page, limit })
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    if (error.message === 'Campaign not found') {
      res.status(StatusCodes.NOT_FOUND).json({ message: error.message })
    } else {
      next(error)
    }
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
  getCampaignProducts
  // getHomeCategoryProducts,
  // getHomeBlogs
}
