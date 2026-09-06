import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { axiosInstance } from '../lib/axios';
import { useSocketStore } from '../store/useSocketStore';

export default function Profile() {
  const { authUser, updateProfile, isUpdatingProfile } = useAuthStore();
  const navigate = useNavigate();
  const [selectedImage, setSelectedImage] = useState(null);
  
  // ADDED: State for earnings
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [totalTrips, setTotalTrips] = useState(0);
  const { socket } = useSocketStore();

  // ADDED: Fetch logic for earnings
  useEffect(() => {
    if (authUser?.activeRole !== 'driver') return;

    const fetchEarnings = async () => {
      try {
        const res = await axiosInstance.get('/trips/earnings');
        setTotalEarnings(res.data.earnings);
        setTotalTrips(res.data.trips);
      } catch (error) {
        console.error("Failed to fetch earnings", error);
      }
    };

    fetchEarnings();

    const handleTripUpdate = (data) => {
      if (data.status === 'COMPLETED') fetchEarnings();
    };

    if (socket) socket.on("trip_status_updated", handleTripUpdate);

    return () => {
      if (socket) socket.off("trip_status_updated", handleTripUpdate);
    };
  }, [authUser, socket]);

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      const base64Image = reader.result;
      setSelectedImage(base64Image);
      await updateProfile({ profilePic: base64Image }); 
    };
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-10 px-4">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => navigate('/')} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200">
            <span className="font-bold px-2">← Back</span>
          </button>
          <h1 className="text-2xl font-black text-gray-900">Your Profile</h1>
        </div>

        {/* EARNINGS WIDGET (Only shows for Drivers) */}
        {authUser?.activeRole === 'driver' && (
          <div className="mb-8 bg-[#1a1a1a] rounded-xl p-4 border border-gray-800 shadow-inner">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">Total Earned</span>
              <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">Trips</span>
            </div>
            <div className="flex justify-between items-end">
              <span className="font-black text-lg text-green-400">{totalEarnings || 0} ETB</span>
              <span className="font-bold text-md text-white">{totalTrips || 0}</span>
            </div>
          </div>
        )}

        {/* Profile Picture Section */}
        <div className="flex flex-col items-center mb-8">
          <label htmlFor="avatar-upload" className="relative cursor-pointer group">
            <img 
              src={selectedImage || authUser?.profilePic || "https://via.placeholder.com/150"} 
              alt="Profile" 
              className="w-32 h-32 rounded-full object-cover border-4 border-gray-100 shadow-md group-hover:opacity-80 transition-opacity"
            />
            <div className="absolute bottom-0 right-0 bg-black text-white p-3 rounded-full shadow-lg group-hover:scale-110 transition-transform">
              📷
            </div>
            <input 
              type="file" 
              id="avatar-upload" 
              className="hidden" 
              accept="image/*" 
              onChange={handleImageUpload} 
              disabled={isUpdatingProfile}
            />
          </label>
          <p className="text-sm text-gray-500 mt-4">
            {isUpdatingProfile ? "Uploading to secure server..." : "Tap your photo to update"}
          </p>
        </div>

        {/* User Details */}
        <div className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
            <p className="text-xs text-gray-500 font-bold uppercase mb-1">Full Name</p>
            <p className="font-semibold text-gray-900">{authUser?.name}</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
            <p className="text-xs text-gray-500 font-bold uppercase mb-1">Phone Number</p>
            <p className="font-semibold text-gray-900">{authUser?.phoneNumber || authUser?.phone_number || "Not provided"}</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
            <p className="text-xs text-gray-500 font-bold uppercase mb-1">Account Type</p>
            <p className="font-semibold text-gray-900 capitalize">{authUser?.activeRole || authUser?.role}</p>
          </div>
        </div>

      </div>
    </div>
  );
}