import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Edit, Save, User, MapPin, Package, DollarSign, Calendar, Download, Printer, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const OrderDetailsModal = ({ 
  order, 
  onClose, 
  onStatusUpdate, 
  onGenerateInvoice, 
  onGenerateDeliveryLabel, 
  onSendInvoiceEmail 
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [status, setStatus] = useState(order.status);
  const [notes, setNotes] = useState(order.adminNotes || '');
  const [trackingNumber, setTrackingNumber] = useState(order.tracking_number || ''); // NEW: State for tracking number

  const statusOptions = [
    { value: 'pending', label: 'Pending', color: 'bg-yellow-100 text-yellow-800' },
    { value: 'processing', label: 'Processing', color: 'bg-blue-100 text-blue-800' },
    { value: 'shipped', label: 'Shipped', color: 'bg-green-100 text-green-800' },
    { value: 'delivered', label: 'Delivered', color: 'bg-purple-100 text-purple-800' },
    { value: 'cancelled', label: 'Cancelled', color: 'bg-red-100 text-red-800' }
  ];

  const handleSave = () => {
    onStatusUpdate(order.id, status, notes, trackingNumber); // UPDATED: Pass trackingNumber
    setIsEditing(false);
  };

  const handleCancel = () => {
    setStatus(order.status);
    setNotes(order.adminNotes || '');
    setTrackingNumber(order.tracking_number || ''); // NEW: Reset tracking number
    setIsEditing(false);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status) => {
    const statusOption = statusOptions.find(s => s.value === status);
    return statusOption?.color || 'bg-gray-100 text-gray-800';
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Order Details</h2>
              <p className="text-gray-600">Order {order?.id || 'N/A'}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="h-6 w-6 text-gray-500" />
            </button>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left Column - Order Info */}
              <div className="space-y-6">
                {/* Order Summary */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <Package className="mr-2 h-5 w-5" />
                    Order Summary
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Order ID:</span>
                      <span className="font-medium">{order?.id || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Date:</span>
                      <span className="font-medium">{order.order_date ? formatDate(order.order_date) : 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Payment Method:</span>
                      <span className="font-medium">{order.payment_method || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Status:</span>
                      <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(order.status)}`}>
                        {order.status || 'Unknown'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Tracking Number:</span>
                      <span className="font-medium">{order.tracking_number || 'Not Set'}</span> {/* NEW: Display tracking number */}
                    </div>
                  </div>
                </div>

                {/* Customer Information */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <User className="mr-2 h-5 w-5" />
                    Customer Information
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Name:</span>
                      <span className="font-medium">{order.customer?.name || order.customer_name || 'Unknown'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Email:</span>
                      <span className="font-medium">{order.customer?.email || order.customer_email || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Mobile:</span>
                      <span className="font-medium">{order.customer?.mobileNumber || order.customer_phone || 'N/A'}</span>
                    </div>
                  </div>
                </div>

                {/* Shipping Address */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <MapPin className="mr-2 h-5 w-5" />
                    Shipping Address
                  </h3>
                  <div className="space-y-2 text-sm text-gray-700">
                    <p>{order.shippingAddress?.name || order.customer?.address?.name || 'N/A'}</p>
                    <p>{order.shippingAddress?.street || 'N/A'}</p>
                    <p>{order.shippingAddress?.city || 'N/A'}, {order.shippingAddress?.state || ''} {order.shippingAddress?.zipCode || ''}</p>
                    <p>{order.shippingAddress?.country || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Right Column - Items and Total */}
              <div className="space-y-6">
                {/* Order Items */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <Package className="mr-2 h-5 w-5" />
                    Order Items
                  </h3>
                  <div className="space-y-4">
                    {(order.items || []).map((item, index) => (
                      <div key={index} className="flex justify-between items-center">
                        <div>
                          <p className="font-medium">{item?.name || 'Unknown Item'}</p>
                          <p className="text-sm text-gray-600">Qty: {item?.quantity || 0} x ₹{item?.price || 0}</p>
                        </div>
                        <p className="font-medium">₹{(item?.quantity || 0) * (item?.price || 0)}</p>
                      </div>
                    ))}
                    {(!order.items || order.items.length === 0) && (
                      <p className="text-gray-500 text-center">No items found</p>
                    )}
                  </div>
                </div>

                {/* Total */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <DollarSign className="mr-2 h-5 w-5" />
                    Payment Details
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between text-gray-600">
                      <span>Subtotal:</span>
                      <span>₹{order.subtotal || 0}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Shipping:</span>
                      <span>₹{order.shipping || 0}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Tax:</span>
                      <span>₹{order.tax || 0}</span>
                    </div>
                    <div className="flex justify-between font-bold text-gray-900 pt-2 border-t">
                      <span>Total:</span>
                      <span>₹{order.total_amount || 0}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => onGenerateInvoice(order)}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Generate Invoice
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => onGenerateDeliveryLabel(order)}
                  >
                    <Printer className="mr-2 h-4 w-4" />
                    Generate Label
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => onSendInvoiceEmail(order)}
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    Send Invoice
                  </Button>
                </div>
              </div>
            </div>

            {/* Status Update Section */}
            <div className="mt-8 bg-gray-50 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Update Order Status</h3>
                {!isEditing && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditing(true)}
                  >
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                )}
              </div>

              {isEditing ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Status
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                    >
                      {statusOptions.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  
                  {status === 'delivered' && ( // NEW: Show tracking number input for 'delivered'
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Tracking Number
                      </label>
                      <Input
                        value={trackingNumber}
                        onChange={(e) => setTrackingNumber(e.target.value)}
                        placeholder="Enter tracking number"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                      />
                    </div>
                  )}
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Admin Notes
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      placeholder="Add any notes about this order..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                    />
                  </div>

                  <div className="flex gap-3">
                    <Button
                      onClick={handleSave}
                      className="bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700"
                      disabled={status === 'delivered' && !trackingNumber} // NEW: Disable if no tracking number for delivered
                    >
                      <Save className="mr-2 h-4 w-4" />
                      Save Changes
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleCancel}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Current Status:</span>
                    <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(order.status)}`}>
                      {order.status || 'Unknown'}
                    </span>
                  </div>
                  {order.adminNotes && (
                    <div>
                      <span className="text-gray-600">Admin Notes:</span>
                      <p className="text-gray-700 mt-1">{order.adminNotes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default OrderDetailsModal;