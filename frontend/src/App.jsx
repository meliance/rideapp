import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/useAuthStore';
import { useSocketStore } from './store/useSocketStore';
import RideMap from './components/RideMap';
import DriverDashboard from './components/DriverDashboard';
import Login from './components/Login';

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

  // Check which role the user holds (adjust this property name if your DB uses `role` instead of `activeRole`)
  const isDriver = authUser?.activeRole === 'driver' || authUser?.role === 'driver';

  return (
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
      <Route path="/login" element={!authUser ? <Login /> : <Navigate to="/" />} />
    </Routes>
  );
}

export default App;