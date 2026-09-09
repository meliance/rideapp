import { useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { Link } from "react-router-dom";

export default function Login() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const { login } = useAuthStore();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Format the phone number to match how it was saved in the database during signup
    const formattedPhone = `+251${phoneNumber}`;
    
    await login({ phoneNumber: formattedPhone, password });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-md space-y-8 rounded-xl bg-white p-8 shadow-lg">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">Sign in to ride</h2>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            
            {/* UPDATED: Phone Number Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
              <div className="flex items-center overflow-hidden rounded-md border border-gray-300 bg-white focus-within:border-black focus-within:ring-1 focus-within:ring-black transition-all sm:text-sm">
                <span className="pl-3 pr-2 py-2 text-gray-500 font-medium select-none border-r border-gray-300 bg-gray-50">
                  +251
                </span>
                <input
                  type="tel"
                  required
                  maxLength={9}
                  className="block w-full border-none px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0 bg-transparent"
                  placeholder="911 234 567"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                required
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black sm:text-sm transition-all"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            className="flex w-full justify-center rounded-md border border-transparent bg-black py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 transition-colors"
          >
            Sign In
          </button>
        </form>
        
        <div className="mt-6 text-center text-gray-600">
          Don't have an account?{" "}
          <Link to="/signup" className="text-blue-600 hover:text-blue-500 font-semibold transition-colors">
            Register
          </Link>
        </div>

      </div>
    </div>
  );
}