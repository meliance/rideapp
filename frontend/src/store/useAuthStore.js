import { create } from 'zustand';
import { axiosInstance } from '../lib/axios.js';

export const useAuthStore = create((set) => ({
  authUser: null,
  isCheckingAuth: true,

  checkAuth: async () => {
    try {
      const res = await axiosInstance.get('/auth/check');
      set({ authUser: res.data });
    } catch (error) {
      console.log("No valid session found");
      set({ authUser: null });
    } finally {
      set({ isCheckingAuth: false });
    }
  },

  login: async (credentials) => {
    try {
      const res = await axiosInstance.post('/auth/login', credentials);
      // FIX: Changed from res.data.user to res.data
      set({ authUser: res.data }); 
    } catch (error) {
      alert(error.response?.data?.message || "Login failed");
    }
  },

  signup: async (userData) => {
    try {
      const res = await axiosInstance.post('/auth/signup', userData);
      set({ authUser: res.data }); 
    } catch (error) {
      alert(error.response?.data?.message || "Signup failed");
    }
  },

  signup: async (userData) => {
    try {
      const res = await axiosInstance.post('/auth/signup', userData);
      set({ authUser: res.data.user });
    } catch (error) {
      alert(error.response?.data?.message || "Signup failed");
    }
  },

  logout: async () => {
    try {
      await axiosInstance.post('/auth/logout');
      set({ authUser: null });
    } catch (error) {
      console.error("Logout failed", error);
    }
  }
}));