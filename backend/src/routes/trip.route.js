import express from 'express';
import { requestTrip, respondToTrip, updateTripLifecycle, getTripHistory} from '../controllers/trip.controller.js';
import { protectRoute, requireRiderMode, requireDriverMode } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.post("/request", protectRoute, requireRiderMode, requestTrip);
router.put("/:tripId/respond", protectRoute, requireDriverMode, respondToTrip);
router.put("/:tripId/status", protectRoute, requireDriverMode, updateTripLifecycle);
router.get("/history", protectRoute, getTripHistory);

export default router;