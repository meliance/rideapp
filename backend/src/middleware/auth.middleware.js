import jwt from "jsonwebtoken";
import { pool } from "../lib/db.js";

export const protectRoute = async (req, res, next) => {
  try {
    const token = req.cookies.jwt;

    if (!token) {
      return res.status(401).json({ message: "Unauthorized - No Token Provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded) {
      return res.status(401).json({ message: "Unauthorized - Invalid Token" });
    }

    const result = await pool.query(
      'SELECT id, name, phone_number, profile_pic, created_at FROM users WHERE id = $1',
      [decoded.userId]
    );
    
    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    req.user = user;
    
    next();

  } catch (error) {
    console.log("Error in protectRoute middleware:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};