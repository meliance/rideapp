import { pool } from "../lib/db.js";

// 1. Fetch high-level business stats
export const getAdminStats = async (req, res) => {
  try {
    const statsQuery = `
      SELECT 
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM driver_profiles WHERE approval_status = 'APPROVED') as total_drivers,
        (SELECT COUNT(*) FROM trips WHERE status = 'COMPLETED') as total_trips,
        (SELECT COALESCE(SUM(fare_estimation), 0) FROM trips WHERE status = 'COMPLETED') as total_revenue
    `;
    const result = await pool.query(statsQuery);
    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Admin stats error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// 2. Fetch drivers waiting for approval
export const getPendingDrivers = async (req, res) => {
  try {
    const query = `
      SELECT u.id as user_id, u.name, u.phone_number, u.profile_pic, 
             dp.vehicle_make, dp.vehicle_model, dp.license_plate
      FROM users u
      JOIN driver_profiles dp ON u.id = dp.user_id
      WHERE dp.approval_status = 'PENDING'
    `;
    const result = await pool.query(query);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Pending drivers error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// 3. Approve or Reject a driver
export const reviewDriver = async (req, res) => {
  const { userId } = req.params;
  const { status } = req.body; // Expects 'APPROVED' or 'REJECTED'
  
  try {
    await pool.query(
      `UPDATE driver_profiles SET approval_status = $1 WHERE user_id = $2`,
      [status, userId]
    );
    res.status(200).json({ message: `Driver successfully ${status.toLowerCase()}` });
  } catch (error) {
    console.error("Review driver error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};