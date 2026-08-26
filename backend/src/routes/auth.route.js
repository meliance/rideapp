import express from "express";
import { 
  signup, 
  driverSignup, 
  login,
  updateProfilePic,
  logout, 
  checkAuth 
} from "../controllers/auth.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/signup", signup);
router.post("/driver/signup", driverSignup);
router.post("/login", login);
router.post("/update-profile-pic", protectRoute, updateProfilePic);
router.put("/update-profile-pic", protectRoute, updateProfilePic);
router.post("/logout", logout);

router.get("/check", protectRoute, checkAuth);

export default router;