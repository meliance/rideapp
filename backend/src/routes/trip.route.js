import express from 'express';
import { requestTrip} from '../controllers/trip.controller.js';
import { protectRoute, requireRiderMode, requireDriverMode } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.post("/request", protectRoute, requireRiderMode, requestTrip);

export default router;