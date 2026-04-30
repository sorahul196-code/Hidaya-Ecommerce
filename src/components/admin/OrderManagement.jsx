import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  ShoppingCart, 
  Search, 
  Filter,
  Eye,
  Edit,
  Download,
  Printer,
  Mail,
  Calendar,
  User,
  MapPin,
  DollarSign
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAdmin } from '@/context/AdminContext';
import { toast } from '@/components/ui/use-toast';
import OrderDetailsModal from './OrderDetailsModal';

const OrderManagement = ({ onClose }) => {
  const { orders, updateOrderStatus } = useAdmin();
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDate, setFilterDate] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const [searchQuery, setSearchQuery] = useState('');

  const statusOptions = [
    { value: 'all', label: 'All Statuses' },
    { value: 'pending', label: 'Pending', color: 'bg-yellow-100 text-yellow-800' },
    { value: 'processing', label: 'Processing', color: 'bg-blue-100 text-blue-800' },
    { value: 'shipped', label: 'Shipped', color: 'bg-green-100 text-green-800' },
    { value: 'completed', label: 'Completed', color: 'bg-purple-100 text-purple-800' },
    { value: 'canceled', label: 'Canceled', color: 'bg-red-100 text-red-800' }
  ];

  const dateOptions = [
    { value: 'all', label: 'All Time' },
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This Week' },
    { value: 'month', label: 'This Month' }
  ];

  // Filter and search orders
  const filteredOrders = useMemo(() => {
    let filtered = orders.map(order => ({
      ...order,
      items: order.items_json ? JSON.parse(order.items_json) : [], // Parse items_json
      shippingAddress: order.shipping_address ? JSON.parse(order.shipping_address) : {}, // Parse shipping_address
      billingAddress: order.billing_address ? JSON.parse(order.billing_address) : {}, // Parse billing_address
      customer: { // NEW: Construct customer object
        name: order.customer_name || 'Unknown Customer',
        email: order.customer_email || '',
        mobileNumber: order.customer_phone || '', // Include if available in DB
        address: order.shipping_address ? JSON.parse(order.shipping_address) : {} // Reuse shipping address if needed
      }
    }));

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(order =>
        String(order.id).includes(searchQuery) ||
        (order.customer_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (order.customer_email || '').toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(order => order.status === filterStatus);
    }

    // Apply date filter
    if (filterDate !== 'all') {
      const now = new Date();
      filtered = filtered.filter(order => {
        const orderDate = new Date(order.order_date);
        if (isNaN(orderDate)) return false; // Handle invalid dates
        switch (filterDate) {
          case 'today':
            return orderDate.toDateString() === now.toDateString();
          case 'week':
            return orderDate >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          case 'month':
            return orderDate >= new Date(now.getFullYear(), now.getMonth(), 1);
          default:
            return true;
        }
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return new Date(b.order_date) - new Date(a.order_date);
        case 'total':
          return (b.total_amount || 0) - (a.total_amount || 0);
        case 'status':
          return (a.status || '').localeCompare(b.status || '');
        case 'customer':
          return (a.customer_name || '').localeCompare(b.customer_name || '');
        default:
          return 0;
      }
    });

    return filtered;
  }, [orders, searchQuery, filterStatus, filterDate, sortBy]);

  const handleStatusUpdate = async (orderId, newStatus, notes) => {
    try {
      await updateOrderStatus(orderId, newStatus, notes);
      // Add notification to DB
      await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'order_update',
          title: 'Order Status Updated',
          message: `Order ${orderId} status changed to ${newStatus}.`,
          orderId
        })
      });
      toast({
        title: 'Order Updated',
        description: `Order #${orderId} status updated to ${newStatus}.`
      });
    } catch (error) {
      console.error('Status update error:', error.message);
      toast({
        title: 'Error',
        description: 'Failed to update order status.',
        variant: 'destructive'
      });
    }
  };

  const handleGenerateInvoice = async (order) => {
    try {
      const res = await fetch(`/api/invoices/${order.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) throw new Error('Failed to generate invoice');
      const { invoiceId, pdfUrl } = await res.json();
      await updateOrderStatus(order.id, 'processing', 'Invoice generated');
      toast({
        title: 'Invoice Generated',
        description: `Invoice #${invoiceId} created for Order #${order.id}.`
      });
      return pdfUrl;
    } catch (error) {
      console.error('Invoice generation error:', error.message);
      toast({
        title: 'Error',
        description: 'Failed to generate invoice.',
        variant: 'destructive'
      });
      throw error;
    }
  };

  const handleGenerateDeliveryLabel = async (order) => {
    try {
      const res = await fetch(`/api/orders/${order.id}/shipping-label`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) throw new Error('Failed to generate shipping label');
      const { shippingLabelUrl } = await res.json();
      await updateOrderStatus(order.id, 'shipped', 'Shipping label generated');
      toast({
        title: 'Shipping Label Generated',
        description: `Shipping label created for Order #${order.id}.`
      });
      return shippingLabelUrl;
    } catch (error) {
      console.error('Shipping label error:', error.message);
      toast({
        title: 'Error',
        description: 'Failed to generate shipping label.',
        variant: 'destructive'
      });
      throw error;
    }
  };

  const handleSendInvoiceEmail = async (order) => {
    try {
      const pdfUrl = await handleGenerateInvoice(order); // Generate invoice first
      await fetch(`/api/invoices/${order.id}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfUrl, email: order.customer_email })
      });
      toast({
        title: 'Invoice Email Sent',
        description: `Invoice sent to ${order.customer_email || 'customer'}.`
      });
    } catch (error) {
      console.error('Email send error:', error.message);
      toast({
        title: 'Error',
        description: 'Failed to send invoice email.',
        variant: 'destructive'
      });
    }
  };

  const getStatusColor = (status) => {
    const statusOption = statusOptions.find(s => s.value === status);
    return statusOption?.color || 'bg-gray-100 text-gray-800';
  };

  const formatDate = (dateString) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Invalid Date';
    }
  };

  return (
    <div className="p-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Order Management</h2>
          <p className="text-gray-600">Track and manage customer orders</p>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search orders..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent"
        >
          {statusOptions.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        
        <select
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent"
        >
          {dateOptions.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent"
        >
          <option value="date">Sort by Date</option>
          <option value="total">Sort by Total</option>
          <option value="status">Sort by Status</option>
          <option value="customer">Sort by Customer</option>
        </select>
      </div>

      {/* Orders List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Order
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Items
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredOrders.map((order, index) => (
                <motion.tr
                  key={order.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className="hover:bg-gray-50"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">#{order.id}</div>
                    <div className="text-sm text-gray-500">{order.payment_method || 'N/A'}</div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-8 h-8 bg-gradient-to-r from-rose-500 to-pink-600 rounded-full flex items-center justify-center">
                        <User className="h-4 w-4 text-white" />
                      </div>
                      <div className="ml-3 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{order.customer_name || 'Guest'}</div>
                        <div className="text-sm text-gray-500 truncate">{order.customer_email || 'No email'}</div>
                      </div>
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{order.items.length} items</div>
                    <div className="text-sm text-gray-500">
                      {order.items.slice(0, 2).map(item => item.name).join(', ')}
                      {order.items.length > 2 && '...'}
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-semibold text-gray-900">₹{order.total_amount?.toFixed(2) || '0.00'}</div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(order.status)}`}>
                      {order.status || 'Unknown'}
                    </span>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{formatDate(order.order_date)}</div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedOrder(order);
                          setShowDetailsModal(true);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleGenerateInvoice(order)}
                        title="Generate Invoice"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleGenerateDeliveryLabel(order)}
                        title="Generate Shipping Label"
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSendInvoiceEmail(order)}
                        title="Send Invoice Email"
                      >
                        <Mail className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Empty State */}
      {filteredOrders.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-16"
        >
          <ShoppingCart className="h-16 w-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No orders found</h3>
          <p className="text-gray-500">
            {searchQuery || filterStatus !== 'all' || filterDate !== 'all'
              ? 'Try adjusting your search or filters'
              : 'Orders will appear here when customers make purchases'
            }
          </p>
        </motion.div>
      )}

      {/* Order Details Modal */}
      {showDetailsModal && selectedOrder && (
        <OrderDetailsModal
          order={selectedOrder}
          onClose={() => {
            setShowDetailsModal(false);
            setSelectedOrder(null);
            onClose();
          }}
          onStatusUpdate={handleStatusUpdate}
          onGenerateInvoice={handleGenerateInvoice}
          onGenerateDeliveryLabel={handleGenerateDeliveryLabel}
          onSendInvoiceEmail={handleSendInvoiceEmail}
        />
      )}
    </div>
  );
};

export default OrderManagement;