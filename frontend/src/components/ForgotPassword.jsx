import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { axiosInstance } from '../lib/axios';

import { auth } from '../lib/firebase';
import { RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';

export default function ForgotPassword() {
  const [step, setStep] = useState(1);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  
  // Stores the Firebase verification session
  const [confirmationResult, setConfirmationResult] = useState(null); 
  
  const navigate = useNavigate();

  const setupRecaptcha = () => {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
        callback: (response) => {
            // reCAPTCHA solved, allow signInWithPhoneNumber.
        }
      });
    }
  };

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      setupRecaptcha();
      const formattedPhone = `+251${phoneNumber}`;
      const appVerifier = window.recaptchaVerifier;

      const confirmation = await signInWithPhoneNumber(auth, formattedPhone, appVerifier);
      
      setConfirmationResult(confirmation);
      setMessage("Please use demo OTP code 123456 to continue.");
      setStep(2);
      
    } catch (err) {
      console.error(err);
      setError('Failed to send SMS. Make sure phone number is valid.');
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.render().then(widgetId => grecaptcha.reset(widgetId));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await confirmationResult.confirm(otp);

      const formattedPhone = `+251${phoneNumber}`;
      
      await axiosInstance.post('/auth/reset-password', { 
        phoneNumber: formattedPhone, 
        newPassword: newPassword 
      });
      
      alert("Password reset successful! You can now log in.");
      navigate('/login');
    } catch (err) {
      setError('Invalid OTP code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-md space-y-8 rounded-xl bg-white p-8 shadow-lg">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">Reset Password</h2>
          <p className="mt-2 text-sm text-gray-600">
            {step === 1 ? "Enter your phone number to receive an OTP." : "Enter the OTP and your new password."}
          </p>
        </div>

        {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm font-medium border border-red-100">{error}</div>}
        {message && <div className="p-3 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium border border-blue-100">{message}</div>}

        <div id="recaptcha-container"></div>

        {step === 1 ? (
          <form className="mt-6 space-y-6" onSubmit={handleRequestOtp}>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
              <div className="flex items-center overflow-hidden rounded-md border border-gray-300 bg-white focus-within:border-black focus-within:ring-1 focus-within:ring-black transition-all sm:text-sm">
                <span className="pl-3 pr-2 py-2 text-gray-500 font-medium select-none border-r border-gray-300 bg-gray-50">
                  +251
                </span>
                <input
                  type="tel"
                  required
                  maxLength={9}
                  className="block w-full border-none px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0 bg-transparent"
                  placeholder="911 234 567"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full justify-center rounded-md border border-transparent bg-black py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-gray-800 disabled:bg-gray-400 transition-colors"
            >
              {loading ? 'Sending...' : 'Send OTP'}
            </button>
          </form>
        ) : (
          <form className="mt-6 space-y-6" onSubmit={handleResetPassword}>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">6-Digit OTP</label>
              <input
                type="text"
                required
                maxLength={6}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-black focus:outline-none focus:ring-1 focus:ring-black sm:text-sm"
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
              <input
                type="password"
                required
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-black focus:outline-none focus:ring-1 focus:ring-black sm:text-sm"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full justify-center rounded-md border border-transparent bg-black py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-gray-800 disabled:bg-gray-400 transition-colors"
            >
              {loading ? 'Resetting...' : 'Verify & Reset Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}