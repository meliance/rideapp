import express from "express";
import { 
  signup, 
  driverSignup, 
  login,
  updateProfilePic,
  logout, 
  checkAuth 
} from "../controllers/auth.controller.js";
import { protectRoute } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/signup", signup);
router.post("/driver/signup", driverSignup);
router.post("/login", login);

// FIX: Changed from /update-profile-pic to /update-profile to match the frontend!
router.put("/update-profile", protectRoute, updateProfilePic);

router.post("/logout", logout);
router.get("/check", protectRoute, checkAuth);

export default router;