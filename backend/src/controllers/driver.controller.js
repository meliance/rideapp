import {pool} from "../lib/db.js";

export const getNearbyDrivers = async (req, res) => {
    try {
        const { latitude, longitude, radius = 2000 } = req.query;
        if (!latitude || !longitude) {
            return res.status(400).json({ error: "Latitude and longitude are required" });
        }

        const query = `
            SELECT 
            dp.user_id as driver_id,
            u.name,
            u.phone_number,
            u.profile_pic,
            dp.vehicle_make,
            dp.vehicle_model,
            dp.license_plate,
            dp.bearing,
            -- Extract raw latitude/longitude for the frontend map markers
            ST_Y(dp.location::geometry) as latitude,
            ST_X(dp.location::geometry) as longitude,
            -- Calculate exact distance in meters
            ST_Distance(dp.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance_meters
        FROM driver_profiles dp
        JOIN users u ON dp.user_id = u.id
        WHERE dp.is_available = true 
            AND dp.approval_status = 'APPROVED'
            -- ST_DWithin filters out anyone outside the radius instantly
            AND ST_DWithin(
            dp.location, 
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 
            $3
            )
        ORDER BY distance_meters ASC
        LIMIT 10; -- Only send the 10 closest cars to keep the map UI clean`;

        const result = await pool.query(query, [longitude, latitude, radius]);
        res.status(200).json({
            success: true,
            count: result.rows.length,
            drivers: result.rows
        });
    } catch (error) {
        console.error("Error fetching nearby drivers:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}