import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/useAuthStore';
import { useSocketStore } from './store/useSocketStore';

// Components
import AdminDashboard from './components/AdminDashboard';
import RideMap from './components/RideMap';
import DriverDashboard from './components/DriverDashboard';
import UpgradeDriver from './components/UpgradeDriver';
import TripHistory from './components/TripHistory';
import Signup from './components/Signup';
import DriverSignup from './components/DriverSignup';
import Login from './components/Login';
import Sidebar from './components/Sidebar';
import Profile from './components/Profile';

function App() {
  const { authUser, isCheckingAuth, checkAuth } = useAuthStore();
  const { connectSocket, disconnectSocket } = useSocketStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (authUser) {
      connectSocket();
    } else {
      disconnectSocket();
    }
  }, [authUser, connectSocket, disconnectSocket]);

  if (isCheckingAuth) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-100">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-black"></div>
      </div>
    );
  }

  const isDriver = authUser?.activeRole === 'driver' || authUser?.role === 'driver';

  return (
    <>
      <Sidebar /> 
      
      <Routes>
        <Route 
          path="/" 
          element={
            authUser ? (
              isDriver ? <DriverDashboard /> : <RideMap />
            ) : (
              <Navigate to="/login" />
            )
          } 
        />
        <Route path="/admin" element={authUser?.isAdmin ? <AdminDashboard /> : <Navigate to="/" />} />
        
        <Route 
          path="/history" 
          element={authUser ? <TripHistory /> : <Navigate to="/login" />} 
        />
        <Route path="/profile" element={authUser ? <Profile /> : <Navigate to="/login" />} />
        <Route 
          path="/login" 
          element={!authUser ? <Login /> : <Navigate to="/" />} 
        />
        <Route 
          path="/upgrade" 
          element={authUser ? <UpgradeDriver /> : <Navigate to="/login" />} 
        />
        <Route 
          path="/signup" 
          element={!authUser ? <Signup /> : <Navigate to="/" />} 
        />
        <Route 
          path="/driver/signup" 
          element={!authUser ? <DriverSignup /> : <Navigate to="/" />} 
        />
      </Routes>
    </>
  );
}

export default App;