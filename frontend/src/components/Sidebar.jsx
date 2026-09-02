import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const { authUser, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  if (!authUser) return null;

  const handleLogout = async () => {
    setIsOpen(false);
    if (logout) await logout();
    navigate('/login');
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed top-4 left-4 z-[2000] bg-white p-3 rounded-full shadow-lg border border-gray-100 hover:bg-gray-50 transition-colors"
      >
        <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* DARK BACKDROP (Closes menu when clicked) */}
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
              <p className="text-green-400 text-sm font-medium capitalize">{authUser.activeRole || authUser.role}</p>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <div className="flex flex-col p-4 space-y-2 mt-6">
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
        </div>

        {/* Logout Button (Pinned to Bottom) */}
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