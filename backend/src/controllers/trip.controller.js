import { pool } from "../lib/db.js";
import { io } from "../lib/socket.js";

export const requestTrip = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const passengerId = req.user.id;
    const { driverId, pickupLat, pickupLng, dropoffLat, dropoffLng, fareEstimation } = req.body;

    if (!driverId || !pickupLat || !pickupLng || !dropoffLat || !dropoffLng || !fareEstimation) {
      return res.status(400).json({ message: "All trip details are required" });
    }

    await client.query('BEGIN');

    // Lock row until transaction COMMIT/ROLLBACK
    const driverCheckQuery = `
      SELECT is_available, approval_status 
      FROM driver_profiles 
      WHERE user_id = $1 FOR UPDATE;
    `;
    const driverCheckResult = await client.query(driverCheckQuery, [driverId]);
    const driver = driverCheckResult.rows[0];

    if (!driver || driver.approval_status !== 'APPROVED' || !driver.is_available) {
      await client.query('ROLLBACK');
      return res.status(410).json({ 
        success: false, 
        message: "The requested driver is no longer available. Please try matching again." 
      });
    }

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

    await client.query('COMMIT');

    // Real-Time Broadcast
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
    client.release();
  }
};

export const respondToTrip = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const driverId = req.user.id;
    const { tripId } = req.params;
    const { status, finalFare } = req.body; // <-- FIX: Added finalFare to destructured body

    if (!["ACCEPTED", "CANCELLED", "IN_PROGRESS", "COMPLETED"].includes(status)) {
      return res.status(400).json({ message: "Invalid status provided." });
    }

    await client.query('BEGIN');

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

    // --- FULL LIFECYCLE STATE MACHINE ---
    if (["ACCEPTED", "CANCELLED"].includes(status)) {
      if (trip.status !== 'REQUESTED') {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `Too late. Trip is already ${trip.status}.` });
      }
    }
    
    if (status === "IN_PROGRESS") {
      if (trip.status !== "ACCEPTED") {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: "Trip must be ACCEPTED before it can be started." });
      }
    }
    
    if (status === "COMPLETED") {
      if (trip.status !== "IN_PROGRESS") {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: "Trip must be IN_PROGRESS before it can be completed." });
      }
    }
    
    let updateTripQuery, queryParams;

    if (status === "COMPLETED" && finalFare) {
      updateTripQuery = `
        UPDATE trips 
        SET status = $1, fare_estimation = $2 
        WHERE id = $3 
        RETURNING id, passenger_id, driver_id, status, fare_estimation;
      `;
      queryParams = [status, finalFare, tripId];
    } else {
      updateTripQuery = `
        UPDATE trips 
        SET status = $1 
        WHERE id = $2 
        RETURNING id, passenger_id, driver_id, status;
      `;
      queryParams = [status, tripId];
    }

    const updatedTripResult = await client.query(updateTripQuery, queryParams);
    const updatedTrip = updatedTripResult.rows[0];

    // Manage Driver Availability on the Market
    if (status === 'ACCEPTED') {
      await client.query(`UPDATE driver_profiles SET is_available = false WHERE user_id = $1`, [driverId]);
    } else if (status === 'COMPLETED' || status === 'CANCELLED') {
      await client.query(`UPDATE driver_profiles SET is_available = true WHERE user_id = $1`, [driverId]);
    }

    await client.query('COMMIT');

    // Real-Time Broadcast to Passenger (Pass the final fare back down to them!)
    io.to(`user_${trip.passenger_id}`).emit("trip_status_updated", {
      tripId: updatedTrip.id,
      status: updatedTrip.status,
      finalFare: finalFare || null, // Emit so the passenger app knows exactly what they paid
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

// Passenger cancellation endpoint
export const cancelTrip = async (req, res) => {
  const client = await pool.connect();
  try {
    const { tripId } = req.params;
    
    await client.query('BEGIN');

    const tripRes = await client.query('SELECT * FROM trips WHERE id = $1 FOR UPDATE', [tripId]);
    const trip = tripRes.rows[0];

    if (!trip || trip.passenger_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: "Unauthorized or trip not found." });
    }

    // FIX: Lock down the cancellation logic! Passengers can only cancel before pickup.
    if (trip.status !== 'REQUESTED' && trip.status !== 'ACCEPTED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: `Cannot cancel trip at this stage (${trip.status}).` });
    }

    // Mark cancelled and release the driver back to the market
    await client.query('UPDATE trips SET status = $1 WHERE id = $2', ['CANCELLED', tripId]);
    if (trip.driver_id) {
      await client.query('UPDATE driver_profiles SET is_available = true WHERE user_id = $1', [trip.driver_id]);
    }

    await client.query('COMMIT');

    // Instantly alert the driver via Socket.io
    if (trip.driver_id) {
      io.to(`user_${trip.driver_id}`).emit("trip_cancelled", { 
        message: "The passenger cancelled the trip." 
      });
    }

    res.status(200).json({ success: true, message: "Trip cancelled successfully." });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error cancelling trip:", error);
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
        LEFT JOIN users u ON t.driver_id = u.id 
        LEFT JOIN driver_profiles dp ON t.driver_id = dp.user_id
        WHERE t.passenger_id = $1 AND t.status IN ('COMPLETED', 'CANCELLED')
        ORDER BY t.created_at DESC
        LIMIT 50; 
      `;
    } else if (role === "driver") {
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
        WHERE t.driver_id = $1 AND t.status IN ('COMPLETED', 'CANCELLED')
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