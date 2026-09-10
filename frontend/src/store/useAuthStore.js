import { create } from 'zustand';
import { axiosInstance } from '../lib/axios.js';

export const useAuthStore = create((set) => ({
  authUser: null,
  isCheckingAuth: true,
  isUpdatingProfile: false, // <-- FIX: Added missing initial state

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
      set({ authUser: res.data }); 
      return true; // <-- NEW: Tell component login worked
    } catch (error) {
      alert(error.response?.data?.message || "Login failed");
      return false; // <-- NEW: Tell component login failed
    }
  },

  signup: async (userData) => {
    try {
      const res = await axiosInstance.post('/auth/signup', userData);
      set({ authUser: res.data }); 
      return true;
    } catch (error) {
      alert(error.response?.data?.message || "Signup failed");
      return false;
    }
  },

  driverSignup: async (userData) => {
    try {
      const res = await axiosInstance.post('/auth/driver/signup', userData);
      set({ authUser: res.data }); 
      return true; 
    } catch (error) {
      alert(error.response?.data?.message || "Driver signup failed");
      return false; 
    }
  },

  logout: async () => {
    try {
      await axiosInstance.post('/auth/logout');
      set({ authUser: null });
    } catch (error) {
      console.error("Logout failed", error);
    }
  },

  updateProfile: async (data) => {
    set({ isUpdatingProfile: true });
    try {
      const res = await axiosInstance.put("/auth/update-profile", data); 
      
      set((state) => ({
        authUser: {
          ...state.authUser,
          ...res.data.user,
          profilePic: res.data.user.profile_pic 
        }
      }));

      alert("Profile updated successfully!");
      return true;
    } catch (error) {
      console.error("Error updating profile:", error);
      alert(error.response?.data?.message || "Failed to update profile");
      return false;
    } finally {
      set({ isUpdatingProfile: false });
    }
  },
}));