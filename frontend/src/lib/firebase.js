import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth"; // <-- NEW: Import the Auth module

const firebaseConfig = {
  apiKey: "AIzaSyB6FWV1lspmnoYp3U4uzHthY4hiyjD6xoQ",
  authDomain: "ride-app-92118.firebaseapp.com",
  projectId: "ride-app-92118",
  storageBucket: "ride-app-92118.firebasestorage.app",
  messagingSenderId: "39770148653",
  appId: "1:39770148653:web:a201f2c81273e392920da4",
  measurementId: "G-P0ZWSWZCR6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// <-- NEW: Initialize Auth and export it so ForgotPassword.jsx can use it
export const auth = getAuth(app);