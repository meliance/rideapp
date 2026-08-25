import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, 
  idleTimeoutMillis: 30000, 
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export const connectDB = async () => {
  try {
    const client = await pool.connect();
    console.log(`PostgreSQL Connected Successfully!`);
    client.release();
  } catch (error) {
    console.error(`PostgreSQL Connection Error: ${error.message}`);
    process.exit(1);
  }
};