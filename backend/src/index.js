import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { connectDB } from './lib/db.js';

import authRoutes from './routes/auth.route.js';


dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;


app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: 'http://localhost:5173', 
    credentials: true, 
  })
);

app.use("/api/auth", authRoutes);
// 3. Base Health Check Route
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Ride App API is running smoothly',
  });
});

app.listen(PORT, async () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  await connectDB();
});