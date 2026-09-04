import express from 'express';
import { requestTrip, respondToTrip, getTripHistory, cancelTrip} from '../controllers/trip.controller.js';
import { protectRoute, requireRiderMode, requireDriverMode } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.post("/request", protectRoute, requireRiderMode, requestTrip);
router.put("/:tripId/cancel", protectRoute, requireRiderMode, cancelTrip);
router.put("/:tripId/respond", protectRoute, requireDriverMode, respondToTrip);
router.get("/history", protectRoute, getTripHistory);

export default router;