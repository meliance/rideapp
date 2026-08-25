import bcrypt from "bcryptjs";
import { pool } from "../lib/db.js";
import { generateToken } from "../lib/utils.js";

export const signup = async (req, res) => {
  const { name, phoneNumber, password } = req.body;
  
  try {
    if (!name || !phoneNumber || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (password.length < 4) {
      return res.status(400).json({ message: "Password must be at least 4 characters" });
    }

    // Check if user exists
    const userExists = await pool.query('SELECT * FROM users WHERE phone_number = $1', [phoneNumber]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ message: "Phone number already exists" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insert user and return specific fields
    const newUserQuery = `
      INSERT INTO users (name, phone_number, password) 
      VALUES ($1, $2, $3) 
      RETURNING id, name, phone_number, profile_pic, created_at
    `;
    const newUserResult = await pool.query(newUserQuery, [name, phoneNumber, hashedPassword]);
    const newUser = newUserResult.rows[0];

    if (newUser) {
      // Generate jwt token here
      generateToken(newUser.id, res);

      res.status(201).json({
        id: newUser.id,
        name: newUser.name,
        phoneNumber: newUser.phone_number,
        profilePic: newUser.profile_pic,
      });
    } else {
      res.status(400).json({ message: "Invalid user data" });
    }
  } catch (error) {
    console.log("Error in signup controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const login = async (req, res) => {
  const { phoneNumber, password } = req.body;
  
  try {
    const result = await pool.query('SELECT * FROM users WHERE phone_number = $1', [phoneNumber]);
    const user = result.rows[0];

    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    generateToken(user.id, res);

    res.status(200).json({
      id: user.id,
      name: user.name,
      phoneNumber: user.phone_number,
      profilePic: user.profile_pic,
    });
  } catch (error) {
    console.log("Error in login controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const logout = (req, res) => {
  try {
    res.cookie("jwt", "", { maxAge: 0 });
    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.log("Error in logout controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

export const checkAuth = (req, res) => {
  try {
    res.status(200).json(req.user);
  } catch (error) {
    console.log("Error in checkAuth controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};