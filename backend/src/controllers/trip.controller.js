import { pool } from "../lib/db.js";
import { io } from "../lib/socket.js";

export const requestTrip = async (req, res) => {
  // 1. Check out a dedicated client for the transaction
  const client = await pool.connect();
  
  try {
    const passengerId = req.user.id;
    const { driverId, pickupLat, pickupLng, dropoffLat, dropoffLng, fareEstimation } = req.body;

    if (!driverId || !pickupLat || !pickupLng || !dropoffLat || !dropoffLng || !fareEstimation) {
      return res.status(400).json({ message: "All trip details are required" });
    }

    // 2. Start Transaction
    await client.query('BEGIN');

    // 3. CONCURRENCY SHIELD: Locks row until transaction COMMIT/ROLLBACK
    const driverCheckQuery = `
      SELECT is_available, approval_status 
      FROM driver_profiles 
      WHERE user_id = $1 FOR UPDATE;
    `;
    const driverCheckResult = await client.query(driverCheckQuery, [driverId]);
    const driver = driverCheckResult.rows[0];

    if (!driver || driver.approval_status !== 'APPROVED' || !driver.is_available) {
      await client.query('ROLLBACK'); // Release lock immediately
      return res.status(410).json({ 
        success: false, 
        message: "The requested driver is no longer available. Please try matching again." 
      });
    }

    // 4. Save to PostgreSQL
    const tripQuery = `
      INSERT INTO trips (
        passenger_id, driver_id, status, 
        pickup_location, dropoff_location, fare_estimation
      )
      VALUES (
        $1, $2, 'REQUESTED', 
        ST_SetSRID(ST_MakePoint($3, $4), 4326), 
        ST_SetSRID(ST_MakePoint($5, $6), 4326), 
        $7
      )
      RETURNING id, passenger_id, driver_id, status, fare_estimation, created_at;
    `;

    const result = await client.query(tripQuery, [
      passengerId, driverId, 
      pickupLng, pickupLat, 
      dropoffLng, dropoffLat, 
      fareEstimation
    ]);
    
    const newTrip = result.rows[0];

    // 5. Commit Transaction (Releases the FOR UPDATE lock)
    await client.query('COMMIT');

    // 6. Real-Time Broadcast
    io.to(`user_${driverId}`).emit("new_ride_request", {
      tripId: newTrip.id,
      passenger: {
        id: passengerId,
        name: req.user.name,
        profilePic: req.user.profilePic || '',
        phoneNumber: req.user.phoneNumber
      },
      pickup: { lat: parseFloat(pickupLat), lng: parseFloat(pickupLng) },
      dropoff: { lat: parseFloat(dropoffLat), lng: parseFloat(dropoffLng) },
      fare: parseFloat(fareEstimation)
    });

    res.status(201).json({
      success: true,
      message: "Ride requested. Waiting for driver confirmation.",
      trip: newTrip
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error in requestTrip execution layer:", error);
    res.status(500).json({ message: "Internal Server Error" });
  } finally {
    // 7. ALWAYS release the client back to the pool
    client.release();
  }
};