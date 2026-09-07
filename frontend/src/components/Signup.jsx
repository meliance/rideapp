import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/useAuthStore"; // 👈 IMPORT THE STORE

export default function Signup() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ name: "", phoneNumber: "", password: "" });
  
  const { signup } = useAuthStore(); // 👈 GRAB THE SIGNUP FUNCTION

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // 1. Send data through Zustand so global state updates
      await signup(formData);
      
      // 2. Redirect to home page
      navigate("/"); 
    } catch (error) {
      console.error("Signup failed:", error);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
      
      {/* Driver Registration Option (Top/Side) */}
      {/* <div className="w-full max-w-md flex justify-end mb-4">
        <Link to="/driver/signup" className="text-sm text-blue-400 hover:text-blue-300 border border-blue-400 px-3 py-1 rounded">
          Want to register as a driver?
        </Link>
      </div> */}

      <div className="w-full max-w-md bg-gray-800 p-8 rounded-lg shadow-lg">
        <h2 className="text-2xl font-bold text-center mb-6">Passenger Sign Up</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <input 
            type="text" placeholder="Full Name" required
            className="w-full p-3 bg-gray-700 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            onChange={(e) => setFormData({...formData, name: e.target.value})}
          />
          <input 
            type="tel" placeholder="Phone Number" required
            className="w-full p-3 bg-gray-700 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            onChange={(e) => setFormData({...formData, phoneNumber: e.target.value})}
          />
          <input 
            type="password" placeholder="Password" required
            className="w-full p-3 bg-gray-700 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            onChange={(e) => setFormData({...formData, password: e.target.value})}
          />
          
          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white p-3 rounded font-bold mt-4 transition-colors">
            Sign Up
          </button>
        </form>

        {/* Bottom Login Option */}
        <div className="mt-6 text-center text-gray-400">
          Have an account?{" "}
          <Link to="/login" className="text-blue-500 hover:text-blue-400 font-semibold">
            Login
          </Link>
        </div>
      </div>
    </div>
  );
}