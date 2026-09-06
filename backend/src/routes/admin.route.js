import express from "express";
import { getAdminStats, getPendingDrivers, reviewDriver } from "../controllers/admin.controller.js";
import { protectRoute, requireAdmin } from "../middlewares/auth.middleware.js"; // <-- Combined into one clean import

const router = express.Router();

router.get("/stats", protectRoute, requireAdmin, getAdminStats);
router.get("/pending-drivers", protectRoute, requireAdmin, getPendingDrivers);
router.put("/review-driver/:userId", protectRoute, requireAdmin, reviewDriver);

export default router;