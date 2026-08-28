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

export const respondToTrip = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const driverId = req.user.id;
    const { tripId } = req.params;
    const { status } = req.body; 

    if (!['ACCEPTED', 'CANCELLED'].includes(status)) {
      return res.status(400).json({ message: "Invalid status. Use ACCEPTED or CANCELLED." });
    }

    await client.query('BEGIN');

    // 1. Lock the specific trip to prevent passenger-cancellation race conditions
    const tripQuery = `
      SELECT id, passenger_id, status 
      FROM trips 
      WHERE id = $1 AND driver_id = $2 
      FOR UPDATE;
    `;
    const tripResult = await client.query(tripQuery, [tripId, driverId]);
    const trip = tripResult.rows[0];

    if (!trip) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: "Trip not found or not assigned to you." });
    }

    if (trip.status !== 'REQUESTED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: `Too late. Trip is already ${trip.status}.` });
    }

    // 2. Update the trip status
    const updateTripQuery = `
      UPDATE trips 
      SET status = $1 
      WHERE id = $2 
      RETURNING id, passenger_id, driver_id, status;
    `;
    const updatedTripResult = await client.query(updateTripQuery, [status, tripId]);
    const updatedTrip = updatedTripResult.rows[0];

    // 3. If accepted, immediately pull the driver off the available market
    if (status === 'ACCEPTED') {
      await client.query(
        `UPDATE driver_profiles SET is_available = false WHERE user_id = $1`,
        [driverId]
      );
    }

    await client.query('COMMIT');

    // 4. Real-Time Broadcast: Ping the passenger's private room with the decision
    io.to(`user_${trip.passenger_id}`).emit("trip_status_updated", {
      tripId: updatedTrip.id,
      status: updatedTrip.status,
      driver: {
        id: driverId,
        name: req.user.name,
        profilePic: req.user.profilePic
      }
    });

    res.status(200).json({
      success: true,
      message: `Trip ${status.toLowerCase()} successfully`,
      trip: updatedTrip
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error in respondToTrip:", error);
    res.status(500).json({ message: "Internal Server Error" });
  } finally {
    client.release();
  }
};

export const updateTripLifecycle = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const driverId = req.user.id;
    const { tripId } = req.params;
    const { status } = req.body; 

    const validStatuses = ['ARRIVED', 'IN_PROGRESS', 'COMPLETED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status. Use ARRIVED, IN_PROGRESS, or COMPLETED." });
    }

    await client.query('BEGIN');

    // 1. Lock and verify the trip belongs to this driver
    const tripQuery = `
      SELECT id, passenger_id, status 
      FROM trips 
      WHERE id = $1 AND driver_id = $2 
      FOR UPDATE;
    `;
    const tripResult = await client.query(tripQuery, [tripId, driverId]);
    const trip = tripResult.rows[0];

    if (!trip) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: "Trip not found or not assigned to you." });
    }

    // 2. Update the status
    const updateTripQuery = `
      UPDATE trips 
      SET status = $1 
      WHERE id = $2 
      RETURNING id, passenger_id, status;
    `;
    const updatedTripResult = await client.query(updateTripQuery, [status, tripId]);
    const updatedTrip = updatedTripResult.rows[0];

    // 3. If COMPLETED, free up the driver to take new rides
    if (status === 'COMPLETED') {
      await client.query(
        `UPDATE driver_profiles SET is_available = true WHERE user_id = $1`,
        [driverId]
      );
    }

    await client.query('COMMIT');

    // 4. Real-Time Broadcast: Update the passenger's UI instantly
    io.to(`user_${trip.passenger_id}`).emit("trip_status_updated", {
      tripId: updatedTrip.id,
      status: updatedTrip.status
    });

    res.status(200).json({
      success: true,
      message: `Trip marked as ${status}`,
      trip: updatedTrip
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error in updateTripLifecycle:", error);
    res.status(500).json({ message: "Internal Server Error" });
  } finally {
    client.release();
  }
};

export const getTripHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.activeSessionRole;

    let query = "";
    
    if (role === "rider") {
      query = `
        SELECT 
          t.id AS trip_id, t.status, t.fare_estimation, t.created_at,
          ST_Y(t.pickup_location::geometry) AS pickup_lat, 
          ST_X(t.pickup_location::geometry) AS pickup_lng,
          ST_Y(t.dropoff_location::geometry) AS dropoff_lat, 
          ST_X(t.dropoff_location::geometry) AS dropoff_lng,
          u.name AS driver_name, u.phone_number AS driver_phone, u.profile_pic AS driver_pic,
          dp.vehicle_make, dp.vehicle_model, dp.license_plate
        FROM trips t
        -- LEFT JOIN ensures we still get the trip even if a driver deleted their account
        LEFT JOIN users u ON t.driver_id = u.id 
        LEFT JOIN driver_profiles dp ON t.driver_id = dp.user_id
        WHERE t.passenger_id = $1
        ORDER BY t.created_at DESC
        LIMIT 50; -- Prevent massive payloads
      `;
    } else if (role === "driver") {
      // 2. Driver Query: Get passenger details
      query = `
        SELECT 
          t.id AS trip_id, t.status, t.fare_estimation, t.created_at,
          ST_Y(t.pickup_location::geometry) AS pickup_lat, 
          ST_X(t.pickup_location::geometry) AS pickup_lng,
          ST_Y(t.dropoff_location::geometry) AS dropoff_lat, 
          ST_X(t.dropoff_location::geometry) AS dropoff_lng,
          u.name AS passenger_name, u.phone_number AS passenger_phone, u.profile_pic AS passenger_pic
        FROM trips t
        JOIN users u ON t.passenger_id = u.id
        WHERE t.driver_id = $1
        ORDER BY t.created_at DESC
        LIMIT 50;
      `;
    } else {
      return res.status(400).json({ message: "Invalid session role" });
    }

    const result = await pool.query(query, [userId]);

    res.status(200).json({
      success: true,
      count: result.rows.length,
      history: result.rows
    });

  } catch (error) {
    console.error("Error fetching trip history:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};