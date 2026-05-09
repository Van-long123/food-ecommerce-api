import express from 'express'
import { ghnController } from '~/controllers/ghnController'
import { ghnValidation } from '~/validations/ghnValidation'

const router = express.Router()

router.get('/provinces', ghnValidation.checkGHNToken, ghnController.getProvinces)
router.get('/districts', ghnValidation.checkGHNToken, ghnController.getDistricts)
router.get('/wards', ghnValidation.checkGHNToken, ghnController.getWards)

export const clientGhnRoute = router
