import express from 'express'
import { clientRouter } from './client/index'
import { adminRouter } from './admin/index'

const router = express.Router()



// ─── Client (Public) ──────────────────────────────────────────────────────────
// Prefix: /v1/client/...
router.use('/client', clientRouter)

// ─── Admin (Protected: isAuthorized + isAdmin) ────────────────────────────────
// Prefix: /v1/admin/...
router.use('/admin', adminRouter)

export const APIs_V1 = router
