import express from 'express';
import { requestTrip, respondToTrip, updateTripLifecycle} from '../controllers/trip.controller.js';
import { protectRoute, requireRiderMode, requireDriverMode } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.post("/request", protectRoute, requireRiderMode, requestTrip);
router.put("/:tripId/respond", protectRoute, requireDriverMode, respondToTrip);
router.put("/:tripId/lifecycle", protectRoute, requireDriverMode, updateTripLifecycle);
export default router;