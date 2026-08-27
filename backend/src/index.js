import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { connectDB } from './lib/db.js';

import { app, server } from './lib/socket.js'; 
import authRoutes from './routes/auth.route.js'; 
import driverRoutes from './routes/driver.route.js';

dotenv.config();

const PORT = process.env.PORT || 5000;

app.use(express.json({ limit: "5mb" })); 
app.use(express.urlencoded({ limit: "5mb", extended: true }));
app.use(cookieParser()); 
app.use(
  cors({
    origin: 'http://localhost:5173', 
    credentials: true, 
  })
);

app.use("/api/auth", authRoutes);
app.use("/api/drivers", driverRoutes);
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'success', message: 'Ride App API is running smoothly' });
});

server.listen(PORT, async () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  await connectDB();
});