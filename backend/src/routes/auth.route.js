import express from "express";
import { 
  signup, 
  driverSignup, 
  upgradeToDriver,
  login,
  updateProfilePic,
  logout, 
  resetPassword,
  checkAuth 
} from "../controllers/auth.controller.js";
import { protectRoute } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/signup", signup);
router.post("/driver/signup", driverSignup);
router.post("/upgradeToDriver",protectRoute, upgradeToDriver);
router.post("/login", login);
router.post("/reset-password", resetPassword);
router.put("/update-profile", protectRoute, updateProfilePic);

router.post("/logout", logout);
router.get("/check", protectRoute, checkAuth);

export default router;