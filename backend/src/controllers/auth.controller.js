import bcrypt from "bcryptjs";
import { pool } from "../lib/db.js";
import cloudinary from "../lib/cloudinary.js";
import { generateToken } from "../lib/utils.js";

// 1. STANDARD PASSENGER SIGNUP
export const signup = async (req, res) => {
  const { name, phoneNumber, password } = req.body;
  
  try {
    if (!name || !phoneNumber || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const userExists = await pool.query('SELECT id FROM users WHERE phone_number = $1', [phoneNumber]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ message: "Phone number already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUserQuery = `
      INSERT INTO users (name, phone_number, password_hash) 
      VALUES ($1, $2, $3) 
      RETURNING id, name, phone_number, profile_pic
    `;
    const newUserResult = await pool.query(newUserQuery, [name, phoneNumber, hashedPassword]);
    const newUser = newUserResult.rows[0];

    // PASSENGERS GET PERSISTENT COOKIES (isSessionOnly = false)
    generateToken(newUser.id, "rider", res, false);

    res.status(201).json({
      id: newUser.id,
      name: newUser.name,
      phoneNumber: newUser.phone_number,
      profilePic: newUser.profile_pic,
      roles: ["rider"],
      isAdmin: false
    });
  } catch (error) {
    console.error("Error in signup:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// 2. FIRST-TIME DRIVER SIGNUP
export const driverSignup = async (req, res) => {
  const { name, phoneNumber, password, vehicleMake, vehicleModel, licensePlate } = req.body;
  
  let client;
  
  try {
    if (!name || !phoneNumber || !password || !vehicleMake || !vehicleModel || !licensePlate) {
      return res.status(400).json({ message: "All fields are required" });
    }

    client = await pool.connect();

    const userExists = await client.query('SELECT id FROM users WHERE phone_number = $1', [phoneNumber]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ message: "Phone number already exists. Please log in to upgrade to a driver account." });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    await client.query('BEGIN');

    const userResult = await client.query(
      `INSERT INTO users (name, phone_number, password_hash) VALUES ($1, $2, $3) RETURNING id, name, phone_number`,
      [name, phoneNumber, hashedPassword]
    );
    const newUserId = userResult.rows[0].id;

    const driverResult = await client.query(
      `INSERT INTO driver_profiles (user_id, vehicle_make, vehicle_model, license_plate) 
       VALUES ($1, $2, $3, $4) 
       RETURNING vehicle_make, license_plate, approval_status`,
      [newUserId, vehicleMake, vehicleModel, licensePlate]
    );

    await client.query('COMMIT');
    const newDriver = driverResult.rows[0];

    // DRIVERS LOG IN EVERY TIME (isSessionOnly = true)
    generateToken(newUserId, "driver", res, false);

    res.status(201).json({
      id: newUserId,
      name: userResult.rows[0].name,
      phoneNumber: userResult.rows[0].phone_number,
      vehicle: {
        make: newDriver.vehicle_make,
        plate: newDriver.license_plate
      },
      status: newDriver.approval_status,
      roles: ["rider", "driver"],
      activeRole: "driver",
      isAdmin: false
    });

  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error("Error in driver signup:", error);
    
    if (error.code === '23505') { 
      return res.status(400).json({ message: "License plate or phone number already in use" });
    }
    res.status(500).json({ message: "Internal Server Error" });
  } finally {
    if (client) client.release();
  }
};

// 3. Login Route
export const login = async (req, res) => {
  const { phoneNumber, password } = req.body;
  
  try {
    if (!phoneNumber || !password) {
      return res.status(400).json({ message: "Phone number and password are required" });
    }

    const query = `
      SELECT u.id, u.name, u.phone_number, u.password_hash, u.profile_pic, u.is_admin,
             dp.approval_status, dp.license_plate
      FROM users u
      LEFT JOIN driver_profiles dp ON u.id = dp.user_id
      WHERE u.phone_number = $1
    `;
    
    const result = await pool.query(query, [phoneNumber]);
    const account = result.rows[0];

    if (!account) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const isPasswordCorrect = await bcrypt.compare(password, account.password_hash);
    if (!isPasswordCorrect) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const roles = ["rider"];
    const isDriver = account.approval_status !== null;
    if (isDriver) roles.push("driver");

    const isApprovedDriver = isDriver && account.approval_status === "APPROVED";
    const activeRole = isApprovedDriver ? "driver" : "rider";

    // SECURITY CHECK: If they an admin, force session-only login!
    const isSessionOnly = account.is_admin;
    
    generateToken(account.id, activeRole, res, isSessionOnly);
    
    const calculatedRole = roles.includes("driver") ? "driver" : "rider";

    res.status(200).json({
      id: account.id,
      name: account.name,
      phoneNumber: account.phone_number,
      profilePic: account.profile_pic,
      roles: roles,
      activeRole: calculatedRole,
      driverStatus: account.approval_status,
      isAdmin: account.is_admin || false 
    });

  } catch (error) {
    console.error("Error in login:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const logout = (req, res) => {
  try {
    res.cookie("jwt", "", { maxAge: 0 });
    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Error in logout:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// 4. UPGRADE EXISTING PASSENGER TO DRIVER
export const upgradeToDriver = async (req, res) => {
  const { vehicleMake, vehicleModel, licensePlate } = req.body;
  const userId = req.user.id; 

  try {
    if (!vehicleMake || !vehicleModel || !licensePlate) {
      return res.status(400).json({ message: "All vehicle details are required" });
    }

    const driverExists = await pool.query(
      "SELECT user_id FROM driver_profiles WHERE user_id = $1", 
      [userId]
    );
    
    if (driverExists.rows.length > 0) {
      return res.status(400).json({ message: "You already have a driver profile linked to this account" });
    }

    const insertQuery = `
      INSERT INTO driver_profiles (user_id, vehicle_make, vehicle_model, license_plate, approval_status)
      VALUES ($1, $2, $3, $4, 'PENDING')
      RETURNING vehicle_make, vehicle_model, license_plate, approval_status
    `;
    
    const result = await pool.query(insertQuery, [userId, vehicleMake, vehicleModel, licensePlate]);
    const driverProfile = result.rows[0];

    // They are applying to be a driver, but act as a rider until approved
    generateToken(userId, "rider", res, false);

    res.status(200).json({
      message: "Driver application submitted successfully",
      vehicle: {
        make: driverProfile.vehicle_make,
        model: driverProfile.vehicle_model,
        plate: driverProfile.license_plate
      },
      status: driverProfile.approval_status,
      roles: ["rider", "driver"],
      activeRole: "rider"
    });

  } catch (error) {
    console.error("Error in upgradeToDriver:", error);
    if (error.code === '23505') { 
      return res.status(400).json({ message: "This license plate is already registered to another driver" });
    }
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const checkAuth = async (req, res) => {
  try {
    const query = `
      SELECT u.id, u.name, u.phone_number, u.profile_pic, u.is_admin,
             dp.approval_status
      FROM users u
      LEFT JOIN driver_profiles dp ON u.id = dp.user_id
      WHERE u.id = $1
    `;
    
    const result = await pool.query(query, [req.user.id]);
    const account = result.rows[0];

    if (!account) {
      return res.status(404).json({ message: "User not found" });
    }

    const roles = ["rider"];
    const isDriver = account.approval_status !== null;
    if (isDriver) roles.push("driver");

    const calculatedRole = roles.includes("driver") ? "driver" : "rider";

    res.status(200).json({
      id: account.id,
      name: account.name,
      phoneNumber: account.phone_number,
      profilePic: account.profile_pic,
      roles: roles,
      activeRole: calculatedRole,
      driverStatus: account.approval_status,
      isAdmin: account.is_admin || false 
    });
  } catch (error) {
    console.error("Error in checkAuth:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const updateProfilePic = async (req, res) => {
  try {
    const { profilePic } = req.body;
    const userId = req.user.id;

    if (!profilePic) {
      return res.status(400).json({ message: "Profile picture is required" });
    }

    const selectQuery = "SELECT profile_pic FROM users WHERE id = $1";
    const userCheck = await pool.query(selectQuery, [userId]);
    const currentPicUrl = userCheck.rows[0]?.profile_pic;

    if (currentPicUrl && currentPicUrl.includes("cloudinary.com")) {
      try {
        const urlParts = currentPicUrl.split("/");
        const folderAndFile = urlParts.slice(-2).join("/");
        const publicId = folderAndFile.split(".")[0];
        
        await cloudinary.uploader.destroy(publicId);
      } catch (deletionError) {
        console.error("Cloudinary asset deletion failed:", deletionError);
      }
    }

    const uploadResponse = await cloudinary.uploader.upload(profilePic, {
      folder: "ride_app_profiles",
      allowed_formats: ["jpg", "jpeg", "png", "webp"],
      transformation: [{ width: 400, height: 400, crop: "fill", quality: "auto" }]
    });

    const updateQuery = `
      UPDATE users 
      SET profile_pic = $1 
      WHERE id = $2 
      RETURNING id, name, phone_number, profile_pic
    `;
    
    const result = await pool.query(updateQuery, [uploadResponse.secure_url, userId]);
    const updatedUser = result.rows[0];

    res.status(200).json({
      message: "Profile picture updated successfully",
      user: updatedUser
    });

  } catch (error) {
    console.error("Error in updateProfilePic:", error);
    if (error.http_code === 413) {
        return res.status(413).json({ message: "Image file size is too large" });
    }
    res.status(500).json({ message: "Internal Server Error" });
  }
};