import express from 'express'
import { StatusCodes } from 'http-status-codes'
import { userRoute } from './userRoute'

const router = express.Router()

router.use('/users', userRoute)

export const APIs_V1 = router