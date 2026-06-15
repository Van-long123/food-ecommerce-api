import express from 'express'
import { aiContentController } from '~/controllers/aiContentController'

const router = express.Router()

// POST /v1/admin/ai-content/generate
// Body: { title: string, type: 'product' | 'article' | 'category' }
router.post('/generate', aiContentController.generate)

export const adminAiContentRoute = router
