import jwt from "jsonwebtoken";
import { pool } from "../lib/db.js";

export const protectRoute = async (req, res, next) => {
  try {
    const token = req.cookies.jwt;

    if (!token) {
      return res.status(401).json({ message: "Unauthorized - No Token Provided" });
    }

    let decoded;
    try {
      // Catch token specific validation failures explicitly
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      if (jwtError.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Unauthorized - Token Has Expired" });
      }
      return res.status(401).json({ message: "Unauthorized - Invalid Token Structure" });
    }

    // Safety Fix: Make sure decoded.id matches whatever key you used in generateToken()
    const targetUserId = decoded.id || decoded.userId; 

    // Fetch user details, driver status, AND admin status without exposing the password hash
    const query = `
      SELECT u.id, u.name, u.phone_number, u.profile_pic, u.is_admin,
             dp.approval_status, dp.is_available
      FROM users u
      LEFT JOIN driver_profiles dp ON u.id = dp.user_id
      WHERE u.id = $1
    `;
    
    const result = await pool.query(query, [targetUserId]);
    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({ message: "User account no longer exists" });
    }

    const roles = ["rider"];
    if (user.approval_status !== null) {
        roles.push("driver");
    }
    if (user.is_admin) {
        roles.push("admin");
    }

    // Build the request object for down-stream controller use
    req.user = {
        id: user.id,
        name: user.name,
        phoneNumber: user.phone_number,
        profilePic: user.profile_pic,
        roles: roles,
        isAdmin: user.is_admin || false, // <--- Added Admin flag
        driverStatus: user.approval_status,
        isDriverAvailable: user.is_available,
        activeSessionRole: decoded.role // Maps out what role they signed in with
    };
    
    next();

  } catch (error) {
    console.error("Error in protectRoute middleware system:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// Restricts endpoints strictly to users operating in Driver Mode
export const requireDriverMode = (req, res, next) => {
  if (req.user.activeSessionRole !== "driver") {
    return res.status(403).json({ message: "Forbidden - You must switch to driver mode to do this" });
  }
  
  if (req.user.driverStatus !== "APPROVED") {
    return res.status(403).json({ message: "Forbidden - Your driver profile is not approved yet" });
  }
  
  next();
};

// Restricts endpoints strictly to users operating in Rider Mode
export const requireRiderMode = (req, res, next) => {
  if (req.user.activeSessionRole !== "rider") {
    return res.status(403).json({ message: "Forbidden - Switch back to passenger mode to request a ride" });
  }
  next();
};

// ==========================================
// NEW: Restricts endpoints strictly to Admins
// ==========================================
export const requireAdmin = (req, res, next) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ message: "Forbidden - Admin access required" });
  }
  next();
};