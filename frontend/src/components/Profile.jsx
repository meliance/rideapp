import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

export default function Profile() {
  const { authUser, updateProfile, isUpdatingProfile } = useAuthStore();
  const navigate = useNavigate();
  const [selectedImage, setSelectedImage] = useState(null);

 const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
          const base64Image = reader.result;
          setSelectedImage(base64Image);
          // THIS MUST MATCH req.body.profilePic
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

        {/* Profile Picture Section */}
        <div className="flex flex-col items-center mb-8">
          {/* Wrap EVERYTHING inside the label so the whole image is clickable */}
          <label htmlFor="avatar-upload" className="relative cursor-pointer group">
            
            {/* The main profile image */}
            <img 
              src={selectedImage || authUser?.profilePic || "https://via.placeholder.com/150"} 
              alt="Profile" 
              className="w-32 h-32 rounded-full object-cover border-4 border-gray-100 shadow-md group-hover:opacity-80 transition-opacity"
            />
            
            {/* Camera icon floating on top */}
            <div className="absolute bottom-0 right-0 bg-black text-white p-3 rounded-full shadow-lg group-hover:scale-110 transition-transform">
              📷
            </div>

            {/* The hidden file input */}
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

        {/* User Details (Read Only for now) */}
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