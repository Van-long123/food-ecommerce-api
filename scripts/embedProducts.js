/**
 * scripts/embedProducts.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Script nhúng vector (embedding) cho toàn bộ sản phẩm trong MongoDB.
 * Chạy một lần trước khi bật tính năng RAG Chatbot.
 * Chạy lại mỗi khi thêm sản phẩm mới hoặc sửa title/description/tags.
 *
 * Cách dùng:
 *   node scripts/embedProducts.js
 *   node scripts/embedProducts.js --force   (ghi đè cả các sản phẩm đã có vector)
 *
 * Model embedding: text-embedding-3-small (OpenAI — 1536 chiều)
 * Rate limit: Thoải mái theo gói OpenAI, batch 10 sản phẩm/lần, delay 300ms
 * ─────────────────────────────────────────────────────────────────────────────
 */

import 'dotenv/config'
import { MongoClient } from 'mongodb'
import OpenAI from 'openai'

// ─── Config ───────────────────────────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI
const DATABASE_NAME = process.env.DATABASE_NAME || 'fresh-food'
const COLLECTION_NAME = 'products'
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const EMBED_MODEL = 'text-embedding-3-small' // 1536 chiều
const BATCH_SIZE = 10
const DELAY_MS = 300
const FORCE_REEMBED = process.argv.includes('--force')

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Làm sạch HTML từ TinyMCE trước khi nhúng vector.
 * Loại bỏ: thẻ HTML, HTML entities, khoảng trắng thừa.
 */
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
 * Xây dựng chuỗi text đại diện cho sản phẩm để nhúng vector.
 * Chiến lược: Lặp title 2 lần để tăng trọng số (tên sản phẩm quan trọng nhất)
 */
const buildProductText = (product) => {
  const title = (product.title || '').trim()
  const desc = stripHtml(product.description).substring(0, 400)
  const tags = Array.isArray(product.tags) ? product.tags.join(' ') : ''
  const healthBenefits = Array.isArray(product.healthBenefits) ? product.healthBenefits.join(' ') : ''
  const unit = product.unit || ''

  // Lặp title 2 lần để tăng trọng số ngữ nghĩa
  return `${title} ${title} ${tags} ${healthBenefits} ${desc} ${unit}`.replace(/\s+/g, ' ').trim()
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const main = async () => {
  if (!MONGODB_URI) {
    console.error('❌ Thiếu MONGODB_URI trong .env')
    process.exit(1)
  }
  if (!OPENAI_API_KEY) {
    console.error('❌ Thiếu OPENAI_API_KEY trong .env')
    process.exit(1)
  }

  console.log('🚀 Script nhúng vector sản phẩm (OpenAI text-embedding-3-small)')
  console.log(`   DB: ${DATABASE_NAME} | Force: ${FORCE_REEMBED}`)

  const client = new MongoClient(MONGODB_URI)
  await client.connect()
  console.log('✅ Đã kết nối MongoDB')

  const db = client.db(DATABASE_NAME)
  const collection = db.collection(COLLECTION_NAME)
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

  // Lấy danh sách sản phẩm cần nhúng vector
  const filter = {
    deleted: false,
    status: 'active',
    ...(FORCE_REEMBED ? {} : { embeddingVector: { $exists: false } }),
  }

  const products = await collection
    .find(filter, {
      projection: { _id: 1, title: 1, description: 1, tags: 1, unit: 1, healthBenefits: 1 },
    })
    .toArray()

  console.log(`📦 Tìm thấy ${products.length} sản phẩm cần nhúng vector\n`)

  if (products.length === 0) {
    console.log('✅ Tất cả sản phẩm đã có vector. Dùng --force để nhúng lại.')
    await client.close()
    return
  }

  let successCount = 0
  let errorCount = 0

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(products.length / BATCH_SIZE)

    process.stdout.write(`Batch ${batchNum}/${totalBatches}: `)

    await Promise.all(
      batch.map(async (product) => {
        try {
          const text = buildProductText(product)
          const response = await openai.embeddings.create({
            model: EMBED_MODEL,
            input: text,
          })
          const vector = response.data[0].embedding // 1536 chiều

          await collection.updateOne(
            { _id: product._id },
            { $set: { embeddingVector: vector, embeddedAt: new Date() } },
          )

          successCount++
          process.stdout.write('✓')
        } catch (err) {
          errorCount++
          process.stdout.write('✗')
          console.error(`\n  ❌ ${product.title}: ${err.message}`)
        }
      }),
    )

    console.log()
    if (i + BATCH_SIZE < products.length) await sleep(DELAY_MS)
  }

  console.log('\n═══════════════════════════════════════')
  console.log(`✅ Thành công : ${successCount} sản phẩm`)
  console.log(`❌ Lỗi       : ${errorCount} sản phẩm`)
  console.log('═══════════════════════════════════════')
  console.log('\n📌 Bước tiếp theo: Tạo Vector Search Index trên MongoDB Atlas UI')
  console.log('   Atlas UI → Cluster → Atlas Search → Create Search Index → JSON:')
  console.log(JSON.stringify({
    fields: [{
      type: 'vector',
      path: 'embeddingVector',
      numDimensions: 1536,   // OpenAI text-embedding-3-small
      similarity: 'cosine',
    }],
  }, null, 2))
  console.log('   Index name: vector_index\n')

  await client.close()
}

main().catch((err) => {
  console.error('💥 Script lỗi:', err)
  process.exit(1)
})
