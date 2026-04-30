import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, XCircle, ShoppingCart, Calendar, User, MapPin, DollarSign, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { useAdmin } from '@/context/AdminContext';
import { useAuth } from '@/context/AuthContext';

const OrderDetailsModal = ({ order, onClose }) => {
  const { siteSettings } = useAdmin();
  const { user } = useAuth();
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [reason, setReason] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState('reason'); // 'reason' or 'otp'
  const shippingRates = siteSettings?.shippingRates || { standard: 5.99, express: 15.99, overnight: 29.99 };
  const freeShippingThreshold = siteSettings?.shippingRates?.freeShippingThreshold || 200;
  if (!order) return null;

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'text-yellow-600 bg-yellow-100';
      case 'processing': return 'text-blue-600 bg-blue-100';
      case 'shipped': return 'text-purple-600 bg-purple-100';
      case 'delivered': return 'text-green-600 bg-green-100';
      case 'canceled': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };
  
  const handleSendOtp = async () => {
    if (!reason.trim()) {
      toast({ title: 'Reason required', variant: 'destructive' });
      return;
    }
    try {
      const res = await fetch(`/api/orders/${order.id}/send-cancel-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user?.token || ''}`,
        },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to send OTP');
      }
      toast({ title: 'OTP Sent', description: 'Check your email for the OTP' });
      setStep('otp');
    } catch (error) {
      toast({ title: 'Failed', description: error.message, variant: 'destructive' });
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) {
      toast({ title: 'Enter valid 6-digit OTP', variant: 'destructive' });
      return;
    }
    try {
      const res = await fetch(`/api/orders/${order.id}/verify-cancel-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user?.token || ''}`,
        },
        body: JSON.stringify({ otp, reason }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to cancel order');
      }
      toast({ title: 'Order Cancelled', description: `Order #${order.id} cancelled successfully.` });
      onClose();
    } catch (error) {
      toast({ title: 'Cancellation Failed', description: error.message, variant: 'destructive' });
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto relative"
      >
        <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center">
            <ShoppingCart className="h-5 w-5 mr-3 text-rose-500" />
            Order Details
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="p-6 space-y-6">
          {/* Order Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-gray-500">Order ID</p>
              <p className="font-medium text-gray-900">#{order.id}</p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-gray-500">Date Placed</p>
              <p className="font-medium text-gray-900">{formatDate(order.order_date)}</p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-gray-500">Total Amount</p>
              <p className="font-bold text-lg text-gray-900">₹{order.total_amount?.toFixed(2)}</p>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center space-x-3">
            <Package className="h-5 w-5 text-gray-500" />
            <span className="text-gray-600">Status:</span>
            <span className={`px-3 py-1 rounded-full font-medium text-sm ${getStatusColor(order.status)}`}>
              {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
            </span>
          </div>

          {/* Items List */}
          <div>
            <h3 className="text-md font-semibold text-gray-800 mb-3">Items Ordered ({order.items?.length || 0})</h3>
            <div className="space-y-3 border border-gray-200 rounded-lg p-4">
              {order.items?.map((item, index) => (
                <div key={index} className="flex justify-between items-center">
                  <div>
                    <p className="font-medium text-gray-800">{item.name}</p>
                    <p className="text-sm text-gray-500">Qty: {item.quantity}</p>
                  </div>
                  <p className="font-medium text-gray-800">₹{(item.subtotal ?? (item.quantity * item.price))?.toFixed(2)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="border-t border-gray-200 pt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Subtotal</span>
              <span className="text-gray-800">₹{order.items?.map((item, index) => (
                (item.subtotal ?? (item.quantity * item.price))
              )).reduce((a, b) => a + b, 0).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Shipping</span>
              <span className="text-gray-800">₹{ (order.total_amount-shippingRates.standard>freeShippingThreshold ? 0 : shippingRates.standard ).toFixed(2) }</span>
            </div>
            <div className="flex justify-between font-bold text-md pt-2 border-t mt-2">
              <span className="text-gray-900">Total</span>
              <span className="text-gray-900">₹{(order.total_amount - (order.shipping_cost || 0) - (order.tax_amount || 0)).toFixed(2)}</span>
            </div>
          </div>
        </div>
        
        <div className="p-6 bg-gray-50 border-t border-gray-200 flex justify-end space-x-3">
          {order.status === 'pending' && (
            <Button
              variant="destructive"
              onClick={() => setShowCancelForm(true)}
              className="flex items-center space-x-2"
            >
              <XCircle className="h-4 w-4" />
              <span>Cancel Order</span>
            </Button>
          )}
          <Button onClick={onClose}>Close</Button>
        </div>

        {showCancelForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 mx-4"
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-red-800">Cancel Order #{order.id}</h3>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setShowCancelForm(false);
                    setReason('');
                    setOtp('');
                    setStep('reason');
                  }}
                >
                  <X className="h-5 w-5 text-gray-600" />
                </Button>
              </div>
              {/* <p className="text-sm text-red-600 mb-4">This action cannot be undone.</p> */}
              {step === 'reason' && (
                <div className="space-y-4">
                  <Input
                    placeholder="Reason for cancellation (e.g., Changed mind, Found better price)"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    required
                  />
                  <Button
                    onClick={handleSendOtp}
                    className="w-full bg-red-600 hover:bg-red-700"
                    disabled={!reason.trim()}
                  >
                    Send OTP to Confirm
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowCancelForm(false);
                      setReason('');
                    }}
                    className="w-full"
                  >
                    Cancel
                  </Button>
                </div>
              )}
              {step === 'otp' && (
                <div className="space-y-4">
                  <Input
                    placeholder="Enter 6-digit OTP from email"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    maxLength={6}
                  />
                  <Button
                    onClick={handleVerifyOtp}
                    className="w-full bg-red-600 hover:bg-red-700"
                    disabled={otp.length !== 6}
                  >
                    Verify OTP and Cancel Order
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setStep('reason');
                      setOtp('');
                    }}
                    className="w-full"
                  >
                    Back to Reason
                  </Button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default OrderDetailsModal;
