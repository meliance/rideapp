import jwt from "jsonwebtoken";

export const generateToken = (id, role, res, isSessionOnly = false) => {
    const tokenLifespan = isSessionOnly ? "7d" : "2y"; 

    const token = jwt.sign({ id, role }, process.env.JWT_SECRET, {
        expiresIn: tokenLifespan
    });
    
    const cookieOptions = {
        httpOnly: true, 
        sameSite: process.env.NODE_ENV !== "development" ? "none" : "strict",
        secure: process.env.NODE_ENV !== "development"
    };

    if (!isSessionOnly) {
        cookieOptions.maxAge = 2 * 365 * 24 * 60 * 60 * 1000;
    }

    res.cookie("jwt", token, cookieOptions);
    
    return token;
};