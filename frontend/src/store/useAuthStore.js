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
  },

  updateProfile: async (data) => {
    set({ isUpdatingProfile: true });
    try {
      // 1. Ensure this URL exactly matches your backend route in auth.route.js!
      const res = await axiosInstance.put("/auth/update-profile", data); 
      
      // 2. Map the nested 'user' object and fix the snake_case naming
      set((state) => ({
        authUser: {
          ...state.authUser,
          ...res.data.user,
          profilePic: res.data.user.profile_pic // Map to what the React UI expects!
        }
      }));

      alert("Profile updated successfully!");
    } catch (error) {
      console.error("Error updating profile:", error);
      alert(error.response?.data?.message || "Failed to update profile");
    } finally {
      set({ isUpdatingProfile: false });
    }
  },

}));