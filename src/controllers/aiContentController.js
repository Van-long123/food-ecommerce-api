import { StatusCodes } from 'http-status-codes'
import { aiContentService } from '~/services/aiContentService'

const generate = async (req, res, next) => {
  try {
    const { title, type } = req.body

    if (!title || !title.trim()) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: 'Vui lòng cung cấp "title" (tên sản phẩm/bài viết/danh mục).'
      })
    }

    if (!['product', 'article', 'category'].includes(type)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: 'Trường "type" không hợp lệ. Chỉ chấp nhận: product, article, category.'
      })
    }

    const result = await aiContentService.generateContent(title.trim(), type)
    res.status(StatusCodes.OK).json(result)
  } catch (error) {
    next(error)
  }
}

export const aiContentController = { generate }
