import 'dotenv/config'
import { MongoClient } from 'mongodb'
import axios from 'axios'

const client = new MongoClient(process.env.MONGODB_URI)
await client.connect()
const db = client.db(process.env.DATABASE_NAME)

// 1. Tìm sản phẩm Emmental
try {
    const res = await axios.post('http://localhost:8017/v1/client/chatbot/message', {
      message: 'smartfood có bán thịt bò ko?',
      sessionId: 'test-session-123'
    });
} catch (error) {
    console.error('Error:', error)
}
const product = await db.collection('products').findOne(
  { title: { $regex: 'emmental', $options: 'i' } },
  { projection: { _id: 1, title: 1, status: 1, deleted: 1, stock: 1, embeddingVector: 1 } }
)

if (product) {
  const hasVector = Array.isArray(product.embeddingVector) && product.embeddingVector.length > 0
  console.log('✅ Tìm thấy:', product.title)
  console.log('   status:', product.status, '| deleted:', product.deleted, '| stock:', product.stock)
  console.log('   embeddingVector:', hasVector ? `${product.embeddingVector.length} chiều ✅` : '❌ CHƯA CÓ VECTOR')
} else {
  console.log('❌ Không tìm thấy sản phẩm "Emmental" trong DB!')
}

// 2. Tổng số sản phẩm đã có vector
const totalWithVector = await db.collection('products').countDocuments({ embeddingVector: { $exists: true } })
const totalActive = await db.collection('products').countDocuments({ deleted: false, status: 'active' })
console.log(`\n📊 Tổng sản phẩm active: ${totalActive}`)
console.log(`📊 Sản phẩm đã có embeddingVector: ${totalWithVector}`)
if (totalWithVector === 0) {
  console.log('\n⚠️  Script embedProducts.js CHƯA ĐƯỢC CHẠY! Đây là nguyên nhân chính.')
}

await client.close()
