import express from 'express';
import { healthController } from '~/controllers/healthController';

const Router = express.Router();

Router.route('/').get(healthController.checkHealth);

export const clientHealthRoute = Router;
