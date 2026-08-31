import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/useAuthStore';
import { useSocketStore } from './store/useSocketStore'; // <-- Import the new store
import RideMap from './components/RideMap';
import Login from './components/Login';

function App() {
  const { authUser, isCheckingAuth, checkAuth } = useAuthStore();
  const { connectSocket, disconnectSocket } = useSocketStore(); // <-- Extract the functions

  // Check for the HTTP-only cookie on first load
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // NEW: Listen to auth state changes to manage the socket
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

  return (
    <Routes>
      <Route path="/" element={authUser ? <RideMap /> : <Navigate to="/login" />} />
      <Route path="/login" element={!authUser ? <Login /> : <Navigate to="/" />} />
    </Routes>
  );
}

export default App;