import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { axiosInstance } from '../lib/axios';
import { useAuthStore } from '../store/useAuthStore';

export default function UpgradeDriver() {
  const navigate = useNavigate();
  const { checkAuth } = useAuthStore();
  const [formData, setFormData] = useState({
    vehicleMake: '',
    vehicleModel: '',
    licensePlate: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      // Note: Verify this matches your exact route in auth.routes.js (e.g., /auth/upgrade-to-driver)
      await axiosInstance.post('/auth/upgradeToDriver', formData);
      
      // Refresh the user session to pull in the new 'PENDING' status
      await checkAuth();
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit application');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 flex flex-col justify-center items-center">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <button onClick={() => navigate('/')} className="mb-6 text-gray-500 font-bold hover:text-black">
          ← Back
        </button>
        
        <h1 className="text-3xl font-black text-gray-900 mb-2">Drive with us.</h1>
        <p className="text-gray-500 mb-8">Turn your vehicle into a business. Submit your details below to get approved by our admin team.</p>

        {error && <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-6 font-bold">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Vehicle Make</label>
            <input 
              type="text" 
              required
              placeholder="e.g., Toyota"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 focus:outline-none focus:border-black font-semibold"
              value={formData.vehicleMake}
              onChange={(e) => setFormData({...formData, vehicleMake: e.target.value})}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Vehicle Model</label>
            <input 
              type="text" 
              required
              placeholder="e.g., Corolla"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 focus:outline-none focus:border-black font-semibold"
              value={formData.vehicleModel}
              onChange={(e) => setFormData({...formData, vehicleModel: e.target.value})}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">License Plate</label>
            <input 
              type="text" 
              required
              placeholder="e.g., AA-B12345"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 focus:outline-none focus:border-black font-semibold"
              value={formData.licensePlate}
              onChange={(e) => setFormData({...formData, licensePlate: e.target.value})}
            />
          </div>

          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full bg-black text-white py-4 rounded-xl font-bold text-lg mt-6 shadow-md hover:bg-gray-900 disabled:bg-gray-400"
          >
            {isLoading ? 'Submitting...' : 'Submit Application'}
          </button>
        </form>
      </div>
    </div>
  );
}