import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { axiosInstance } from '../lib/axios';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ total_users: 0, total_drivers: 0, total_trips: 0, total_revenue: 0 });
  const [pendingDrivers, setPendingDrivers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

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
      // Refresh the lists after updating
      fetchData(); 
    } catch (error) {
      console.error(`Failed to ${status} driver`, error);
    }
  };

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center"><div className="h-12 w-12 animate-spin rounded-full border-b-4 border-black"></div></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-black text-gray-900">Admin Control Center</h1>
          <button onClick={() => navigate('/')} className="px-4 py-2 bg-white border border-gray-200 rounded-lg font-bold hover:bg-gray-100">
            Back to Map
          </button>
        </div>

        {/* High-Level Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <p className="text-sm font-bold text-gray-500 uppercase">Total Revenue</p>
            <p className="text-3xl font-black text-green-500">{stats.total_revenue} ETB</p>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <p className="text-sm font-bold text-gray-500 uppercase">Completed Trips</p>
            <p className="text-3xl font-black text-gray-900">{stats.total_trips}</p>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <p className="text-sm font-bold text-gray-500 uppercase">Active Drivers</p>
            <p className="text-3xl font-black text-gray-900">{stats.total_drivers}</p>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
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
                  <th className="p-4 font-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingDrivers.length === 0 ? (
                  <tr>
                    <td colSpan="3" className="p-8 text-center text-gray-500 font-medium">No pending applications right now!</td>
                  </tr>
                ) : (
                  pendingDrivers.map((driver) => (
                    <tr key={driver.user_id} className="border-b border-gray-100 hover:bg-gray-50">
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
                        <p className="text-sm text-gray-500 px-2 py-1 bg-gray-200 rounded inline-block mt-1">
                          Plate: {driver.license_plate}
                        </p>
                      </td>
                      <td className="p-4">
                        <div className="flex gap-2">
                          <button 
                            onClick={() => handleReview(driver.user_id, 'APPROVED')}
                            className="px-4 py-2 bg-green-500 text-white font-bold rounded-lg hover:bg-green-600 transition-colors"
                          >
                            Approve
                          </button>
                          <button 
                            onClick={() => handleReview(driver.user_id, 'REJECTED')}
                            className="px-4 py-2 bg-red-100 text-red-600 font-bold rounded-lg hover:bg-red-200 transition-colors"
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}