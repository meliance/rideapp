import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/useAuthStore";

export default function DriverSignup() {
  const navigate = useNavigate();
  const { driverSignup } = useAuthStore(); // We will add this to your store next!
  
  const [isUploading, setIsUploading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    phoneNumber: "",
    password: "",
    vehicleMake: "",
    vehicleModel: "",
    licensePlate: ""
  });

  const [licenseImage, setLicenseImage] = useState(null);
  const [libreImage, setLibreImage] = useState(null);

  // Helper function to convert images to Base64
  const handleImageChange = (e, setImageState) => {
    const file = e.target.files[0];
    if (!file) return;

    // Optional: Add a simple file size check (e.g., max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert("File is too large. Please upload an image under 5MB.");
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = () => {
      setImageState(reader.result);
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!licenseImage || !libreImage) {
      return alert("Please upload both your Driver's License and Libre.");
    }

    setIsUploading(true);
    
    // Combine text fields with the base64 images
    const payload = {
      ...formData,
      licenseImage,
      libreImage
    };

    const isSuccess = await driverSignup(payload);
    
    if (isSuccess) {
      navigate("/"); 
    } else {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4 py-8">
      
      {/* Link back to Passenger Signup */}
      <div className="w-full max-w-2xl flex justify-end mb-4">
        <Link 
          to="/signup" 
          className="text-sm text-gray-400 hover:text-white transition-colors font-medium"
        >
          ← Back to Passenger Sign Up
        </Link>
      </div>

      <div className="w-full max-w-2xl bg-gray-800 p-8 rounded-lg shadow-lg">
        <h2 className="text-3xl font-bold text-center mb-2">Become a Driver</h2>
        <p className="text-gray-400 text-center mb-8">Upload your documents and start earning.</p>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* SECTION 1: Personal Details */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-blue-400 border-b border-gray-700 pb-2">Personal Details</h3>
              <input 
                type="text" placeholder="Full Name" required
                className="w-full p-3 bg-gray-700 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                onChange={(e) => setFormData({...formData, name: e.target.value})}
              />
              
              <div className="flex items-center bg-gray-700 rounded focus-within:ring-2 focus-within:ring-blue-500 overflow-hidden transition-all">
                <span className="pl-4 pr-3 text-gray-400 font-bold border-r border-gray-600 select-none">+251</span>
                <input 
                  type="tel" placeholder="911 234 567" required maxLength={9}
                  className="w-full p-3 bg-transparent text-white focus:outline-none placeholder-gray-500 tracking-wide"
                  onChange={(e) => setFormData({...formData, phoneNumber: e.target.value})}
                />
              </div>

              <input 
                type="password" placeholder="Password" required minLength={4}
                className="w-full p-3 bg-gray-700 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                onChange={(e) => setFormData({...formData, password: e.target.value})}
              />
            </div>

            {/* SECTION 2: Vehicle Details */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-blue-400 border-b border-gray-700 pb-2">Vehicle Details</h3>
              <input 
                type="text" placeholder="Vehicle Make (e.g., Toyota)" required
                className="w-full p-3 bg-gray-700 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                onChange={(e) => setFormData({...formData, vehicleMake: e.target.value})}
              />
              <input 
                type="text" placeholder="Vehicle Model (e.g., Vitz)" required
                className="w-full p-3 bg-gray-700 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                onChange={(e) => setFormData({...formData, vehicleModel: e.target.value})}
              />
              <input 
                type="text" placeholder="License Plate (e.g., AA-A12345)" required
                className="w-full p-3 bg-gray-700 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                onChange={(e) => setFormData({...formData, licensePlate: e.target.value})}
              />
            </div>
          </div>

          {/* SECTION 3: Documents */}
          <div className="space-y-4 pt-4 border-t border-gray-700">
            <h3 className="text-lg font-bold text-blue-400 pb-2">Required Documents</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* License Upload */}
              <div className="bg-gray-700 p-4 rounded border border-gray-600 border-dashed hover:border-blue-500 transition-colors">
                <label className="block text-sm font-medium text-gray-300 mb-2">Driver's License</label>
                <input 
                  type="file" accept="image/*" required
                  onChange={(e) => handleImageChange(e, setLicenseImage)}
                  className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 transition-all cursor-pointer"
                />
              </div>

              {/* Libre Upload */}
              <div className="bg-gray-700 p-4 rounded border border-gray-600 border-dashed hover:border-blue-500 transition-colors">
                <label className="block text-sm font-medium text-gray-300 mb-2">Vehicle Libre</label>
                <input 
                  type="file" accept="image/*" required
                  onChange={(e) => handleImageChange(e, setLibreImage)}
                  className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 transition-all cursor-pointer"
                />
              </div>

            </div>
          </div>
          
          <button 
            type="submit" 
            disabled={isUploading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white p-4 rounded font-bold mt-6 transition-colors shadow-lg"
          >
            {isUploading ? "Uploading Documents & Submitting..." : "Submit Application"}
          </button>
        </form>

        <div className="mt-6 text-center text-gray-400">
          Already a driver?{" "}
          <Link to="/login" className="text-blue-500 hover:text-blue-400 font-semibold">
            Login
          </Link>
        </div>
      </div>
    </div>
  );
}