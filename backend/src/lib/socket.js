import { Server } from "socket.io";
import http from "http";
import express from "express";
import jwt from "jsonwebtoken";
import { pool } from "./db.js";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [process.env.CLIENT_URL || "http://localhost:5173"], 
    methods: ["GET", "POST"],
    credentials: true
  },
});

io.use(async (socket, next) => {
  try {
    const rawCookies = socket.handshake.headers.cookie;
    if (!rawCookies) {
      return next(new Error("Authentication error - No cookies provided"));
    }

    const cookies = {};
    rawCookies.split(";").forEach((cookieString) => {
      const [key, value] = cookieString.split("=");
      if (key && value) {
        cookies[key.trim()] = value.trim();
      }
    });
    
    const token = cookies.jwt;

    if (!token) {
      return next(new Error("Authentication error - No token found"));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    socket.userId = decoded.id;
    next();
  } catch (err) {
    console.error("Socket authentication failed:", err.message);
    return next(new Error("Authentication failed - Invalid token"));
  }
});

io.on("connection", async (socket) => {
  const { userId } = socket;
  console.log(`Secure Connection Established: User ${userId} via socket ${socket.id}`);

  socket.join(`user_${userId}`);

  socket.on("toggle_status", async ({ isOnline }) => {
    try {
      const result = await pool.query(
        "UPDATE driver_profiles SET is_available = $1 WHERE user_id = $2 AND approval_status = 'APPROVED' RETURNING *",
        [isOnline, userId]
      );
      
      if (result.rowCount > 0) {
         console.log(`✅ Driver ${userId} toggled status to: ${isOnline ? "ONLINE" : "OFFLINE"}`);
      } else {
         console.log(`❌ User ${userId} attempted to go online, but is not an approved driver.`);
      }
    } catch (err) {
      console.error(`Failed to toggle status for user ${userId}:`, err);
    }
  });

  socket.on("update_location", async (coords) => {
    const { latitude, longitude, bearing, passengerId } = coords;

    try {
      const spatialQuery = `
        UPDATE driver_profiles 
        SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
            bearing = $3,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $4 AND approval_status = 'APPROVED'
      `;
      
      const result = await pool.query(spatialQuery, [parseFloat(longitude), parseFloat(latitude), bearing || 0, userId]);
      
      if (result.rowCount > 0 && passengerId) {
        io.to(`user_${passengerId}`).emit("driver_location_update", { latitude, longitude });
      }
      
    } catch (err) {
      console.error(`Failed to update coordinates for driver ${userId}:`, err);
    }
  });

  socket.on("disconnect", async () => {
    console.log(`User ${userId} disconnected from socket ${socket.id}`);

    const remainingSockets = await io.in(`user_${userId}`).fetchSockets();
    
    if (remainingSockets.length === 0) {
      try {
        await pool.query(
          "UPDATE driver_profiles SET is_available = false WHERE user_id = $1",
          [userId]
        );
        console.log(`Driver ${userId} closed the app. Force marked OFFLINE.`);
      } catch (dbErr) {
        console.error("Error cleaning up driver status on disconnect:", dbErr);
      }
    }
  });
});

export { io, app, server };