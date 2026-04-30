import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/components/ui/use-toast';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const validateEmail = (email) => emailRegex.test(email);
const validatePassword = (password) => password && password.length >= 6;

const AuthContext = createContext();

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || 'hidayaquery@gmail.com';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const storedUser = localStorage.getItem('hidaya-user');
    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        setUser(userData);
      } catch (error) {
        console.error('Failed to parse stored user data:', error);
        localStorage.removeItem('hidaya-user');
      }
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    setIsAuthenticating(true);
    
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Login failed');
      const stored = { ...json.user, token: json.token, isAdmin: (json.user?.email === ADMIN_EMAIL), lastLogin: new Date().toISOString() };
      localStorage.setItem('hidaya-user', JSON.stringify(stored));
      setUser(stored);
      toast({ title: 'Login Successful!', description: `Welcome back, ${json.user.name}!` });
      return stored;
    } catch (error) {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid email or password. Please try again.",
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsAuthenticating(false);
    }
  };

  const register = async (userData) => {
    setIsAuthenticating(true);
    
    try {
      // Validate input
      if (!userData.name || !userData.email || !userData.password) {
        throw new Error("All fields are required.");
      }

      if (!validateEmail(userData.email)) {
        throw new Error("Please enter a valid email address.");
      }

      if (!validatePassword(userData.password)) {
        throw new Error("Password must be at least 6 characters long.");
      }
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userData.email, name: userData.name, phone: userData.mobile, address: userData.address, password: userData.password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Registration failed');
      
      const isAdmin = (json.user?.email === ADMIN_EMAIL);
      const stored = { ...json.user, token: json.token, isAdmin, lastLogin: new Date().toISOString() };
      localStorage.setItem('hidaya-user', JSON.stringify(stored));
      setUser(stored);
      toast({ title: 'Account Created Successfully!', description: `Welcome to HIDAYA Jewelry, ${json.user.name}!` });
      return stored;
    } catch (error) {
      toast({
        title: "Registration Failed",
        description: error.message || "Failed to create account. Please try again.",
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsAuthenticating(false);
    }
  };

  // OTP-based registration helpers
  const requestRegistrationOtp = async (email) => {
    const res = await fetch('/api/auth/request-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to request OTP');
    toast({ title: 'OTP Sent', description: `OTP sent to ${email}` });
    return json;
  };

  const registerWithOtp = async (payload) => {
    setIsAuthenticating(true);
    try {
      const res = await fetch('/api/auth/register-with-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Registration failed');
      const stored = { ...json.user, token: json.token, isAdmin: (json.user?.email === ADMIN_EMAIL), lastLogin: new Date().toISOString() };
      localStorage.setItem('hidaya-user', JSON.stringify(stored));
      setUser(stored);
      toast({ title: 'Account Created!', description: `Welcome to HIDAYA Jewelry, ${json.user.name}!` });
      return stored;
    } catch (error) {
      toast({ title: 'Registration Failed', description: error.message || 'Invalid OTP', variant: 'destructive' });
      throw error;
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Password reset via OTP
  const requestPasswordResetOtp = async (email) => {
    const res = await fetch('/api/auth/reset-password/request-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to request OTP');
    toast({ title: 'OTP Sent', description: `OTP sent to your email` });
    return json;
  };

  const verifyPasswordResetOtp = async ({ email, otp, newPassword, confirmPassword }) => {
    const res = await fetch('/api/auth/reset-password/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp, newPassword, confirmPassword }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Authentication failed');
    toast({ title: 'Password Updated', description: 'You can now sign in with your new password.' });
    return json;
  };

  const updateProfile = async (updates) => {
    if (!user || user.isAdmin) {
      throw new Error("Cannot update admin profile.");
    }

    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
        body: JSON.stringify(updates),
      });
      const updatedUser = await res.json();
      if (!res.ok) throw new Error(updatedUser.error || 'Failed to update profile');
      
      // Update local user data
      const currentUser = JSON.parse(localStorage.getItem('hidaya-user')) || {};
      const userWithTimestamp = {
        ...currentUser,
        ...updatedUser,
        isAdmin: (updatedUser?.email === ADMIN_EMAIL)
      };
      
      localStorage.setItem('hidaya-user', JSON.stringify({ ...userWithTimestamp, token: user.token }));
      setUser(userWithTimestamp);
      
      toast({
        title: "Profile Updated",
        description: "Your profile has been updated successfully."
      });
      
      return updatedUser;
    } catch (error) {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update profile. Please try again.",
        variant: "destructive"
      });
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem('hidaya-user');
    setUser(null);
    toast({
      title: "Logged Out",
      description: "You have been successfully logged out."
    });
    navigate('/');
  };

  const checkAuth = async () => {
    if (!user) return false;
    
    try {
      // Verify token by fetching profile
      const res = await fetch('/api/users/me', { headers: { Authorization: `Bearer ${user.token}` }});
      if (!res.ok) { logout(); return false; }
      return true;
    } catch (error) {
      console.error('Auth check failed:', error);
      // Don't logout on network errors, only on actual auth failures
      return true;
    }
  };

  const value = {
    user,
    isAuthenticated: !!user,
    loading,
    isAuthenticating,
    login,
    register,
    requestRegistrationOtp,
    registerWithOtp,
    requestPasswordResetOtp,
    verifyPasswordResetOtp,
    logout,
    updateProfile,
    checkAuth,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};