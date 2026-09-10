import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { axiosInstance } from '../lib/axios';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ total_users: 0, total_drivers: 0, total_trips: 0, total_revenue: 0 });
  const [pendingDrivers, setPendingDrivers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // NEW: State to hold the driver currently being reviewed in the modal
  const [selectedDriver, setSelectedDriver] = useState(null);

  const fetchData = async () => {
    try {
      const [statsRes, driversRes] = await Promise.all([
        axiosInstance.get('/admin/stats'),
        axiosInstance.get('/admin/pending-drivers')
      ]);
      setStats(statsRes.data);
      setPendingDrivers(driversRes.data);
    } catch (error) {
      console.error("Failed to fetch admin data", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleReview = async (userId, status) => {
    try {
      await axiosInstance.put(`/admin/review-driver/${userId}`, { status });
      setSelectedDriver(null); // Close the modal if it's open
      fetchData(); // Refresh the lists after updating
    } catch (error) {
      console.error(`Failed to ${status} driver`, error);
      alert("Failed to update driver status");
    }
  };

  const handleCardClick = (category) => {
    // Placeholder for future routing (e.g., navigate('/admin/users'))
    alert(`Detailed view for ${category} coming soon!`);
  };

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center"><div className="h-12 w-12 animate-spin rounded-full border-b-4 border-black"></div></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-10 relative">
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-black text-gray-900">Admin Control Center</h1>
          <button onClick={() => navigate('/')} className="px-4 py-2 bg-white border border-gray-200 rounded-lg font-bold hover:bg-gray-100 transition-colors shadow-sm">
            Back to Map
          </button>
        </div>

        {/* High-Level Stats (Now Interactive) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <div onClick={() => handleCardClick('Revenue')} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 cursor-pointer hover:shadow-md hover:border-green-200 transition-all transform hover:-translate-y-1">
            <p className="text-sm font-bold text-gray-500 uppercase">Total Revenue</p>
            <p className="text-3xl font-black text-green-500">{stats.total_revenue} ETB</p>
          </div>
          <div onClick={() => handleCardClick('Trips')} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 cursor-pointer hover:shadow-md hover:border-gray-300 transition-all transform hover:-translate-y-1">
            <p className="text-sm font-bold text-gray-500 uppercase">Completed Trips</p>
            <p className="text-3xl font-black text-gray-900">{stats.total_trips}</p>
          </div>
          <div onClick={() => handleCardClick('Drivers')} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 cursor-pointer hover:shadow-md hover:border-gray-300 transition-all transform hover:-translate-y-1">
            <p className="text-sm font-bold text-gray-500 uppercase">Active Drivers</p>
            <p className="text-3xl font-black text-gray-900">{stats.total_drivers}</p>
          </div>
          <div onClick={() => handleCardClick('Users')} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 cursor-pointer hover:shadow-md hover:border-gray-300 transition-all transform hover:-translate-y-1">
            <p className="text-sm font-bold text-gray-500 uppercase">Total Users</p>
            <p className="text-3xl font-black text-gray-900">{stats.total_users}</p>
          </div>
        </div>

        {/* Pending Approvals Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100 bg-black text-white">
            <h2 className="text-xl font-bold">Pending Driver Applications ({pendingDrivers.length})</h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-sm uppercase text-gray-500">
                  <th className="p-4 font-bold">Applicant</th>
                  <th className="p-4 font-bold">Vehicle Info</th>
                  <th className="p-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingDrivers.length === 0 ? (
                  <tr>
                    <td colSpan="3" className="p-8 text-center text-gray-500 font-medium">No pending applications right now!</td>
                  </tr>
                ) : (
                  pendingDrivers.map((driver) => (
                    <tr key={driver.user_id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          {driver.profile_pic ? (
                            <img src={driver.profile_pic} className="w-10 h-10 rounded-full object-cover" alt="avatar" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-500">
                              {driver.name.charAt(0)}
                            </div>
                          )}
                          <div>
                            <p className="font-bold text-gray-900">{driver.name}</p>
                            <p className="text-sm text-gray-500">{driver.phone_number}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <p className="font-bold text-gray-900">{driver.vehicle_make} {driver.vehicle_model}</p>
                        <p className="text-sm text-gray-500 px-2 py-1 bg-gray-200 rounded inline-block mt-1 font-mono">
                          Plate: {driver.license_plate}
                        </p>
                      </td>
                      <td className="p-4 text-right">
                        {/* CHANGED: Replaced inline Approve/Reject with a View Details button */}
                        <button 
                          onClick={() => setSelectedDriver(driver)}
                          className="px-5 py-2 bg-blue-50 text-blue-600 border border-blue-200 font-bold rounded-lg hover:bg-blue-600 hover:text-white transition-colors"
                        >
                          Review Documents
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* NEW: DOCUMENT REVIEW MODAL */}
      {selectedDriver && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div>
                <h2 className="text-2xl font-black text-gray-900">Application Review</h2>
                <p className="text-gray-500 text-sm mt-1">Reviewing {selectedDriver.name}'s documents</p>
              </div>
              <button 
                onClick={() => setSelectedDriver(null)}
                className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center font-bold text-gray-600 hover:bg-gray-300 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="p-6 overflow-y-auto flex-grow bg-gray-50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* License Section */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                  <h3 className="font-bold text-gray-700 mb-3 uppercase tracking-wide text-sm flex items-center gap-2">
                    <span>💳</span> Driver's License
                  </h3>
                  <div className="aspect-[4/3] bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center border border-gray-200 relative">
                    {selectedDriver.license_image_url ? (
                      <img src={selectedDriver.license_image_url} alt="License" className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-gray-400 font-medium">No image provided</span>
                    )}
                  </div>
                </div>

                {/* Libre Section */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                  <h3 className="font-bold text-gray-700 mb-3 uppercase tracking-wide text-sm flex items-center gap-2">
                    <span>📄</span> Vehicle Libre
                  </h3>
                  <div className="aspect-[4/3] bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center border border-gray-200 relative">
                    {selectedDriver.libre_image_url ? (
                      <img src={selectedDriver.libre_image_url} alt="Libre" className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-gray-400 font-medium">No image provided</span>
                    )}
                  </div>
                </div>

              </div>
            </div>

            {/* Modal Footer / Actions */}
            <div className="p-6 border-t border-gray-100 bg-white flex justify-end gap-3">
              <button 
                onClick={() => handleReview(selectedDriver.user_id, 'REJECTED')}
                className="px-6 py-3 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-600 hover:text-white transition-colors"
              >
                Reject Application
              </button>
              <button 
                onClick={() => handleReview(selectedDriver.user_id, 'APPROVED')}
                className="px-8 py-3 bg-green-500 text-white font-bold rounded-xl shadow-lg hover:bg-green-600 hover:shadow-xl transition-all transform hover:-translate-y-1"
              >
                Approve Driver
              </button>
            </div>
            
          </div>
        </div>
      )}

    </div>
  );
}