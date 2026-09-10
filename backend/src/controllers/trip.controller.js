import { pool } from "../lib/db.js";
import { io } from "../lib/socket.js";

export const requestTrip = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const passengerId = req.user.id;
    const { driverIds, pickupLat, pickupLng, dropoffLat, dropoffLng, fareEstimation } = req.body;

    if (!driverIds || !Array.isArray(driverIds) || driverIds.length === 0 || !pickupLat || !pickupLng || !dropoffLat || !dropoffLng || !fareEstimation) {
      return res.status(400).json({ message: "All trip details and nearby drivers are required" });
    }

    await client.query('BEGIN');

    const tripQuery = `
      INSERT INTO trips (
        passenger_id, status, 
        pickup_location, dropoff_location, fare_estimation
      )
      VALUES (
        $1, 'REQUESTED', 
        ST_SetSRID(ST_MakePoint($2, $3), 4326), 
        ST_SetSRID(ST_MakePoint($4, $5), 4326), 
        $6
      )
      RETURNING id, passenger_id, status, fare_estimation, created_at;
    `;

    const result = await client.query(tripQuery, [
      passengerId, pickupLng, pickupLat, dropoffLng, dropoffLat, fareEstimation
    ]);
    
    const newTrip = result.rows[0];

    await client.query('COMMIT');

    // FIX 3: Loop through all nearby drivers and broadcast the ride!
    driverIds.forEach(driverId => {
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
    });

    res.status(201).json({
      success: true,
      message: "Ride broadcasted to nearby drivers.",
      trip: newTrip
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error in requestTrip:", error);
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
    const { status, finalFare } = req.body;

    if (!["ACCEPTED", "CANCELLED", "IN_PROGRESS", "COMPLETED"].includes(status)) {
      return res.status(400).json({ message: "Invalid status provided." });
    }

    if (status === "CANCELLED") {
       const tripStatusCheck = await client.query('SELECT status, driver_id FROM trips WHERE id = $1', [tripId]);
       const currentTrip = tripStatusCheck.rows[0];
       
       if (currentTrip && currentTrip.status === "REQUESTED" && currentTrip.driver_id === null) {
          return res.status(200).json({ success: true, message: "Ride silently declined." });
       }
    }

    await client.query('BEGIN');

    if (status === "ACCEPTED") {
      const claimQuery = `
        UPDATE trips 
        SET driver_id = $1, status = 'ACCEPTED' 
        WHERE id = $2 AND status = 'REQUESTED' AND driver_id IS NULL 
        RETURNING *;
      `;
      const claimResult = await client.query(claimQuery, [driverId, tripId]);

      if (claimResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(410).json({ message: "Too late! Another driver already accepted this ride, or it was cancelled." });
      }

      const updatedTrip = claimResult.rows[0];

      // Take the winning driver off the market
      await client.query(`UPDATE driver_profiles SET is_available = false WHERE user_id = $1`, [driverId]);
      await client.query('COMMIT');

      // Fetch driver details to send to the passenger
      let phone = "No Phone", carModel = "Standard Car", plateNumber = "N/A";
      try {
        const userRes = await client.query(`SELECT * FROM users WHERE id = $1`, [driverId]);
        const dpRes = await client.query(`SELECT * FROM driver_profiles WHERE user_id = $1`, [driverId]);
        phone = userRes.rows[0]?.phone_number || "No Phone";
        carModel = dpRes.rows[0]?.vehicle_make || dpRes.rows[0]?.vehicle_model || "Standard Car";
        plateNumber = dpRes.rows[0]?.license_plate || "N/A";
      } catch (err) { console.warn("Driver detail fetch failed", err.message); }

      // Alert the passenger that their ride was claimed!
      io.to(`user_${updatedTrip.passenger_id}`).emit("trip_status_updated", {
        tripId: updatedTrip.id,
        status: updatedTrip.status,
        driver: {
          id: driverId,
          name: req.user.name,
          profilePic: req.user.profilePic,
          phone: phone,
          carModel: carModel,
          plateNumber: plateNumber
        }
      });

      return res.status(200).json({ success: true, trip: updatedTrip });
    }

    // --- STANDARD ONGOING TRIP UPDATES (IN_PROGRESS, COMPLETED, CANCELLED post-accept) ---
    const tripQuery = `SELECT * FROM trips WHERE id = $1 AND driver_id = $2 FOR UPDATE;`;
    const tripResult = await client.query(tripQuery, [tripId, driverId]);
    const trip = tripResult.rows[0];

    if (!trip) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: "Trip not found or not assigned to you." });
    }

    if (status === "IN_PROGRESS" && trip.status !== "ACCEPTED") {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: "Trip must be ACCEPTED before it can be started." });
    }
    if (status === "COMPLETED" && trip.status !== "IN_PROGRESS") {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: "Trip must be IN_PROGRESS before it can be completed." });
    }
    
    let updateTripQuery, queryParams;
    if (status === "COMPLETED" && finalFare) {
      updateTripQuery = `UPDATE trips SET status = $1, fare_estimation = $2 WHERE id = $3 RETURNING *;`;
      queryParams = [status, finalFare, tripId];
    } else {
      updateTripQuery = `UPDATE trips SET status = $1 WHERE id = $2 RETURNING *;`;
      queryParams = [status, tripId];
    }

    const updatedTripResult = await client.query(updateTripQuery, queryParams);
    const updatedTrip = updatedTripResult.rows[0];

    if (status === 'COMPLETED' || status === 'CANCELLED') {
      await client.query(`UPDATE driver_profiles SET is_available = true WHERE user_id = $1`, [driverId]);
    }

    await client.query('COMMIT');

    io.to(`user_${trip.passenger_id}`).emit("trip_status_updated", {
      tripId: updatedTrip.id,
      status: updatedTrip.status,
      finalFare: finalFare || null
    });

    res.status(200).json({ success: true, trip: updatedTrip });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error in respondToTrip:", error);
    res.status(500).json({ message: "Internal Server Error" });
  } finally {
    client.release();
  }
};

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

    if (trip.status !== 'REQUESTED' && trip.status !== 'ACCEPTED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: `Cannot cancel trip at this stage (${trip.status}).` });
    }

    await client.query('UPDATE trips SET status = $1 WHERE id = $2', ['CANCELLED', tripId]);
    
    // Only update driver profile if a driver actually claimed it
    if (trip.driver_id) {
      await client.query('UPDATE driver_profiles SET is_available = true WHERE user_id = $1', [trip.driver_id]);
    }

    await client.query('COMMIT');

    if (trip.driver_id) {
      io.to(`user_${trip.driver_id}`).emit("trip_cancelled", { message: "The passenger cancelled the trip." });
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

export const getDriverEarnings = async (req, res) => {
  try {
    const driverId = req.user.id; 

    const query = `
      SELECT 
        COALESCE(SUM(fare_estimation), 0) AS total_earnings,
        COUNT(id) AS total_trips
      FROM trips 
      WHERE driver_id = $1 AND status = 'COMPLETED'
    `;
    
    const result = await pool.query(query, [driverId]);
    
    res.status(200).json({
      success: true,
      earnings: result.rows[0].total_earnings,
      trips: result.rows[0].total_trips
    });
  } catch (error) {
    console.error("Error fetching driver earnings:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};