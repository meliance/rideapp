import jwt from "jsonwebtoken";

export const generateToken = (id, role, res) => {
    const token = jwt.sign({ id, role }, process.env.JWT_SECRET, {
        expiresIn: "7d"
    });
    
    res.cookie("jwt", token, {
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
        httpOnly: true, 
        sameSite: "strict",
        secure: process.env.NODE_ENV !== "development"
    });
    
    return token;
};