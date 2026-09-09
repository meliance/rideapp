import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/useAuthStore";

export default function Signup() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ name: "", phoneNumber: "", password: "" });
  
  const { signup } = useAuthStore(); 

  const handleSubmit = async (e) => {
    e.preventDefault();
    const isSuccess = await signup(formData);
    if (isSuccess) {
      navigate("/"); 
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
      <div className="w-full max-w-md bg-gray-800 p-8 rounded-lg shadow-lg">
        <h2 className="text-2xl font-bold text-center mb-6">Passenger Sign Up</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <input 
            type="text" placeholder="Full Name" required
            className="w-full p-3 bg-gray-700 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            onChange={(e) => setFormData({...formData, name: e.target.value})}
          />
          
          {/* UPDATED: Flexbox container for static country code */}
          <div className="flex items-center bg-gray-700 rounded focus-within:ring-2 focus-within:ring-blue-500 overflow-hidden transition-all">
            <span className="pl-4 pr-3 text-gray-400 font-bold border-r border-gray-600 select-none">
              +251
            </span>
            <input 
              type="tel" 
              placeholder="911 234 567" 
              required
              maxLength={9}
              className="w-full p-3 bg-transparent text-white focus:outline-none placeholder-gray-500 tracking-wide"
              onChange={(e) => setFormData({...formData, phoneNumber: e.target.value})}
            />
          </div>

          <input 
            type="password" placeholder="Password" required
            className="w-full p-3 bg-gray-700 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            onChange={(e) => setFormData({...formData, password: e.target.value})}
          />
          
          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white p-3 rounded font-bold mt-4 transition-colors">
            Sign Up
          </button>
        </form>

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