import { create } from 'zustand';
import { io } from 'socket.io-client';
import { useAuthStore } from './useAuthStore';

const SOCKET_URL = import.meta.env.MODE === "development" 
  ? "http://localhost:5000" 
  : "https://rideapp-so1i.onrender.com";

export const useSocketStore = create((set, get) => ({
  socket: null,
  
  connectSocket: () => {
    const { authUser } = useAuthStore.getState();
    if (!authUser || get().socket?.connected) return;

    const socket = io(SOCKET_URL, {
      withCredentials: true, 
    });

    socket.on("connect", () => {
      console.log("🟢 Socket securely connected:", socket.id);
    });

    socket.on("connect_error", (err) => {
      console.error("🔴 Socket connection error:", err.message);
    });

    set({ socket });
  },

  disconnectSocket: () => {
    if (get().socket?.connected) {
      get().socket.disconnect();
      set({ socket: null });
      console.log("⚪ Socket disconnected");
    }
  }
}));