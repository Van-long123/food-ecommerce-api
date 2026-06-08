import OpenAI from 'openai'
import { env } from '~/config/environment'

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY })

// Clean TinyMCE HTML before embedding.
const stripHtml = (html) =>
  (html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Generate embedding vector for a product.
 * Returns null on failure to keep main flow healthy.
 */
const generateProductVector = async (product) => {
  try {
    const title = (product?.title || '').trim()
    const desc = stripHtml(product?.description || '').substring(0, 400)
    const tags = Array.isArray(product?.tags) ? product.tags.join(' ') : ''
    const healthBenefits = Array.isArray(product?.healthBenefits)
      ? product.healthBenefits.join(' ')
      : ''
    const unit = product?.unit || ''

    // Repeat title twice to emphasize product name.
    const textToEmbed = `${title} ${title} ${tags} ${healthBenefits} ${desc} ${unit}`
      .replace(/\s+/g, ' ')
      .trim()

    if (!textToEmbed) return null

    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: textToEmbed,
    })

    return response.data[0]?.embedding || null
  } catch (error) {
    console.error('❌ Lỗi khi tạo Vector Embedding:', error?.message || error)
    return null
  }
}

export const embeddingService = {
  generateProductVector,
}
