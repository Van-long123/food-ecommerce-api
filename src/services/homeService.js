import { GET_DB } from '~/config/mongodb'
import { categoryModel } from '~/models/categoryModel'
import { articleModel } from '~/models/articleModel'
import { productModel } from '~/models/productModel'
import { parsePositiveInt, parseBoolean, toNumberOrNull } from '~/utils/parsers'

const DEFAULT_LIMITS = {
  campaign: 20,
  category: 100,
  categoryProduct: 20,
  blog: 4
}

const CAMPAIGNS = [
  {
    id: 'khuyen_mai_hot',
    slug: 'khuyen-mai-hot',
    name: 'Khuyến mãi<br/>HOT',
    match: { discountPercentage: { $gt: 0 } },
    sort: { discountPercentage: -1, position: 1, createdAt: -1 }
  },
  {
    id: 'ban_chay',
    slug: 'ban-chay',
    name: 'Bán<br/>chạy',
    match: { featured: true },
    sort: { position: 1, createdAt: -1 }
  },
  {
    id: 'doc_quyen_online',
    slug: 'doc-quyen-online',
    name: 'Độc quyền<br/>trực tuyến',
    match: { isOnlineExclusive: true },
    sort: { position: 1, createdAt: -1 }
  },
  {
    id: 'goi_y',
    slug: 'goi-y-cho-ban',
    name: 'Gợi ý<br/>cho bạn',
    match: {},
    sort: { createdAt: -1, position: 1 }
  }
]



const mapProductForHome = (item) => {
  const price = toNumberOrNull(item.price) || 0
  const originalPrice = toNumberOrNull(item.originalPrice)

  return {
    id: item._id?.toString?.() || String(item._id || ''),
    slug: item.slug || '',
    name: item.title || '',
    image: item.thumbnail || '',
    price,
    originalPrice: originalPrice && originalPrice > price ? originalPrice : null,
    discountPercent: toNumberOrNull(item.discountPercentage),
    isBestPrice: Boolean(item.isBestPrice),
    isOnlineExclusive: Boolean(item.isOnlineExclusive),
    buttonText: 'Mua'
  }
}

const mapBlogForHome = (article) => ({
  id: article._id?.toString?.() || String(article._id || ''),
  slug: article.slug || '',
  title: article.title || '',
  description: article.shortDescription || '',
  image: article.thumbnail || '',
  publishedAt: article.publishedAt || article.createdAt || null
})


const getHomeAggregate = async (queryParams = {}) => {
  const campaignLimit = parsePositiveInt(queryParams.campaignLimit, DEFAULT_LIMITS.campaign)
  const categoryLimit = parsePositiveInt(queryParams.categoryLimit, DEFAULT_LIMITS.category)
  const categoryProductLimit = parsePositiveInt(
    queryParams.categoryProductLimit,
    DEFAULT_LIMITS.categoryProduct
  )
  const blogLimit = parsePositiveInt(queryParams.blogLimit, DEFAULT_LIMITS.blog)

  const includeCampaigns = parseBoolean(queryParams.includeCampaigns, true)
  const includeCategories = parseBoolean(queryParams.includeCategories, true)
  const includeBlogs = parseBoolean(queryParams.includeBlogs, true)

  const campaignsPromise = includeCampaigns
    ? Promise.all(
      CAMPAIGNS.map(async (campaign) => {
        const products = await productModel.getCampaignProducts({
          match: campaign.match,
          sort: campaign.sort,
          limit: campaignLimit
        })
        return {
          id: campaign.id,
          slug: campaign.slug,
          name: campaign.name,
          products: products.map(mapProductForHome)
        }
      })
    )
    : Promise.resolve([])

  const categorySectionsPromise = includeCategories
    ? categoryModel
      .getAllForMenu({ deleted: false, status: 'active', type: 'product' })
      .then(async (categories) => {
        const sidebarCategories = categories.map((category) => ({
          id: category._id.toString(),
          slug: category.slug,
          title: category.title,
          thumbnail: category.thumbnail || ''
        }))

        const selectedCategories = categories.slice(0, categoryLimit)
        const sections = await Promise.all(
          selectedCategories.map(async (category) => {
            const products = await productModel.getProductsByCategory(
              category._id,
              categoryProductLimit
            )

            return {
              id: category._id.toString(),
              slug: category.slug,
              title: category.title,
              badgeText: category.badgeText || '',
              bannerImage: category.bannerImage || category.thumbnail || '',
              position: category.position || 0,
              products: products.map(mapProductForHome)
            }
          })
        )

        return { sidebarCategories, sections }
      })
    : Promise.resolve({ sidebarCategories: [], sections: [] })

  const blogsPromise = includeBlogs
    ? articleModel.getHomeArticles(blogLimit).then((res) => res.data.map(mapBlogForHome))
    : Promise.resolve([])

  const [campaigns, categoryData, blogs] = await Promise.all([
    campaignsPromise,
    categorySectionsPromise,
    blogsPromise
  ])

  return {
    sidebarCategories: categoryData.sidebarCategories,
    campaigns,
    categorySections: categoryData.sections,
    blogs,
    meta: {
      generatedAt: new Date().toISOString(),
      campaignCount: campaigns.length,
      categoryCount: categoryData.sections.length,
      blogCount: blogs.length,
      limits: {
        campaignLimit,
        categoryLimit,
        categoryProductLimit,
        blogLimit
      },
      sectionProductMode: 'embedded',
      lazyEndpoints: {
        categoryProducts: '/v1/client/home/category-products?slug=<category-slug>&limit=20',
        blogs: '/v1/client/home/blogs?limit=4'
      }
    }
  }
}

// const getLandingPageData = async () => {
//   return getHomeAggregate({
//     campaignLimit: DEFAULT_LIMITS.campaign,
//     categoryLimit: DEFAULT_LIMITS.category,
//     categoryProductLimit: DEFAULT_LIMITS.categoryProduct,
//     blogLimit: DEFAULT_LIMITS.blog,
//     includeCampaigns: true,
//     includeCategories: true,
//     includeBlogs: true
//   })
// }

export const homeService = {
  // getLandingPageData,
  getHomeAggregate,
  // getHomeCategoryProducts,
  // getHomeBlogs
}
