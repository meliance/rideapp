import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { axiosInstance } from '../lib/axios';
import { useSocketStore } from '../store/useSocketStore';

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const { authUser, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Hooks must be called before any early returns!
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [totalTrips, setTotalTrips] = useState(0);
  const { socket } = useSocketStore();

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

  // Early return comes AFTER all hooks
  if (!authUser) return null;

  const handleLogout = async () => {
    setIsOpen(false);
    if (logout) await logout();
    navigate('/login');
  };

  return (
    <>
      {/* FLOATING HAMBURGER BUTTON */}
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed top-4 left-4 z-[2000] bg-white p-3 rounded-full shadow-lg border border-gray-100 hover:bg-gray-50 transition-colors"
      >
        <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* DARK BACKDROP */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-[2500] transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* SLIDING DRAWER */}
      <div 
        className={`fixed top-0 left-0 h-full w-72 bg-white shadow-2xl z-[3000] transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* User Profile Header */}
        <div className="bg-black text-white p-6 pb-8 rounded-br-[3rem]">
          <div className="flex items-center gap-4 mt-4">
            {authUser.profilePic ? (
              <img src={authUser.profilePic} alt="Profile" className="w-16 h-16 rounded-full border-2 border-white object-cover shadow-sm" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center border-2 border-white shadow-sm">
                <span className="text-2xl font-bold uppercase">{authUser.name?.charAt(0) || 'U'}</span>
              </div>
            )}
            <div>
              <h2 className="font-bold text-lg truncate w-36">{authUser.name}</h2>
              {/* FIX: Dynamically show 'Admin' if they are an admin! */}
              <p className="text-green-400 text-sm font-medium capitalize">
                {authUser.isAdmin ? 'Admin / ' : ''}{authUser.activeRole || authUser.role}
              </p>
            </div>
          </div>
        </div>

        {/* Earnings Widget UI */}
        {authUser?.activeRole === 'driver' && (
          <div className="mt-6 mx-4 bg-[#1a1a1a] rounded-xl p-4 border border-gray-800 shadow-inner">
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

        {/* Navigation Links */}
        <div className="flex flex-col p-4 space-y-2 mt-2">
          <button 
            onClick={() => { setIsOpen(false); navigate('/'); }}
            className={`flex items-center gap-4 p-4 rounded-xl font-bold transition-all ${
              location.pathname === '/' ? 'bg-gray-100 text-black shadow-sm' : 'text-gray-500 hover:bg-gray-50 hover:text-black'
            }`}
          >
            <span className="text-xl">🗺️</span> Map
          </button>
          
          <button 
            onClick={() => { setIsOpen(false); navigate('/history'); }}
            className={`flex items-center gap-4 p-4 rounded-xl font-bold transition-all ${
              location.pathname === '/history' ? 'bg-gray-100 text-black shadow-sm' : 'text-gray-500 hover:bg-gray-50 hover:text-black'
            }`}
          >
            <span className="text-xl">📜</span> Trip History
          </button>

          <button 
            onClick={() => { setIsOpen(false); navigate('/profile'); }}
            className={`flex items-center gap-4 p-4 rounded-xl font-bold transition-all ${
              location.pathname === '/profile' ? 'bg-gray-100 text-black shadow-sm' : 'text-gray-500 hover:bg-gray-50 hover:text-black'
            }`}
          >
            <span className="text-xl">👤</span> Profile
          </button>

          {/* UPGRADE TO DRIVER BUTTON (Only visible to Riders) */}
      {authUser?.activeRole === 'rider' && authUser?.driverStatus === null && (
        <button 
          onClick={() => { setIsOpen(false); navigate('/upgrade'); }}
          className={`flex items-center gap-4 p-4 rounded-xl font-bold transition-all ${
            location.pathname === '/upgrade' ? 'bg-gray-100 text-black shadow-sm' : 'text-gray-500 hover:bg-gray-50 hover:text-black'
          }`}
        >
          <span className="text-xl">🚀</span> Become a Driver
        </button>
      )}

      {/* If they already applied but are waiting for Admin approval */}
      {authUser?.activeRole === 'rider' && authUser?.driverStatus === 'PENDING' && (
        <div className="flex items-center gap-4 p-4 rounded-xl font-bold text-yellow-600 bg-yellow-50 mx-2">
          <span className="text-xl">⏳</span> Application Pending
        </div>
      )}

          {/* FIX: Added the Admin Panel Button! (Only visible to Admins) */}
          {authUser?.isAdmin && (
            <button 
              onClick={() => { setIsOpen(false); navigate('/admin'); }}
              className={`flex items-center gap-4 p-4 rounded-xl font-bold transition-all ${
                location.pathname === '/admin' ? 'bg-gray-100 text-black shadow-sm' : 'text-gray-500 hover:bg-gray-50 hover:text-black'
              }`}
            >
              <span className="text-xl">🛡️</span> Admin Panel
            </button>
          )}
        </div>

        {/* Logout Button */}
        <div className="absolute bottom-0 left-0 w-full p-4 border-t border-gray-100 bg-white">
          <button 
            onClick={handleLogout}
            className="flex items-center justify-center gap-3 p-4 w-full rounded-xl font-bold text-red-500 bg-red-50 hover:bg-red-100 transition-colors"
          >
            <span>🚪</span> Logout
          </button>
        </div>
      </div>
    </>
  );
}