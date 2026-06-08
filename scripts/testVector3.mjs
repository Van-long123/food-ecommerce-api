import 'dotenv/config'
import { MongoClient } from 'mongodb'
import OpenAI from 'openai'

const client = new MongoClient(process.env.MONGODB_URI)
await client.connect()
const db = client.db(process.env.DATABASE_NAME)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const message = 'gợi ý các sản phẩm liên quan tới thịt';
try {
  const embedRes = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: message,
  })
  const vector = embedRes.data[0].embedding

  const products = await db.collection('products').aggregate([
    {
      $vectorSearch: {
        index: 'vector_index',
        path: 'embeddingVector',
        queryVector: vector,
        numCandidates: 100,
        limit: 18,
      },
    },
    {
      $match: { deleted: false, status: 'active', stock: { $gt: 0 } },
    },
    {
      $limit: 8,
    },
    {
      $project: { _id: 0, title: 1, stock: 1, score: { $meta: 'vectorSearchScore' } },
    },
  ]).toArray()

  console.log('Kết quả Vector Search:', products)
} catch (e) {
  console.error('Lỗi Atlas:', e.message)
}

await client.close()
