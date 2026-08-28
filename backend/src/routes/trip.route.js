import express from 'express';
import { requestTrip, respondToTrip} from '../controllers/trip.controller.js';
import { protectRoute, requireRiderMode, requireDriverMode } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.post("/request", protectRoute, requireRiderMode, requestTrip);
router.put("/:tripId/respond", protectRoute, requireDriverMode, respondToTrip);
export default router;