import { Server } from "socket.io";
import http from "http";
import express from "express";
import jwt from "jsonwebtoken";
import * as cookie from "cookie"; 
import { pool } from "./db.js";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173"], 
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

    // Parse the incoming cookie string
    const parsedCookies = cookie.parse(rawCookies);
    const token = parsedCookies.jwt;

    if (!token) {
      return next(new Error("Authentication error - No token found"));
    }

    // Decode token securely using your existing system secret
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    socket.userId = decoded.id;
    socket.activeRole = decoded.role;    
    next();
  } catch (err) {
    console.error("Socket authentication failed:", err.message);
    return next(new Error("Authentication failed - Invalid token"));
  }
});

io.on("connection", async (socket) => {
  const { userId, activeRole } = socket;
  console.log(`Secure Connection Established: User ${userId} (${activeRole}) via socket ${socket.id}`);

  socket.join(`user_${userId}`);

  if (activeRole === "driver") {
    try {
      await pool.query(
        "UPDATE driver_profiles SET is_available = true WHERE user_id = $1 AND approval_status = 'APPROVED'",
        [userId]
      );
      console.log(`Driver ${userId} status set to AVAILABLE in database`);
    } catch (dbErr) {
      console.error("Error setting driver available on connection:", dbErr);
    }
  }

  socket.on("update_location", async (coords) => {
    const { latitude, longitude, bearing } = coords;
    
    if (socket.activeRole !== "driver") return;

    try {
      const spatialQuery = `
        UPDATE driver_profiles 
        SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326),
            bearing = $3,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $4 AND is_available = true
      `;
      await pool.query(spatialQuery, [longitude, latitude, bearing || 0, userId]);
      
    } catch (err) {
      console.error(`Failed to update coordinates for driver ${userId}:`, err);
    }
  });

  socket.on("disconnect", async () => {
    console.log(`User ${userId} disconnected from socket ${socket.id}`);

    const remainingSockets = await io.in(`user_${userId}`).fetchSockets();
    
    if (remainingSockets.length === 0 && activeRole === "driver") {
      try {
        await pool.query(
          "UPDATE driver_profiles SET is_available = false WHERE user_id = $1",
          [userId]
        );
        console.log(`Driver ${userId} has left completely. Marked OFFLINE.`);
      } catch (dbErr) {
        console.error("Error cleaning up driver status on disconnect:", dbErr);
      }
    }
  });
});

export { io, app, server };
