import express from "express";
import {getNearbyDrivers} from "../controllers/driver.controller.js";
import {protectRoute, requireRiderMode} from "../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/nearby", protectRoute, requireRiderMode, getNearbyDrivers);

export default router;