import React, { useState, useEffect } from 'react'; // UPDATED: Added useEffect
import { motion } from 'framer-motion';
import { 
  TrendingUp, 
  Package, 
  ShoppingCart, 
  DollarSign,
  Eye,
  Star,
  Plus,
  Settings,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button'; // NEW: For filter buttons
import { Input } from '@/components/ui/input'; // NEW: For date inputs
import { useAdmin } from '@/context/AdminContext';
import { toast } from '@/components/ui/use-toast';
import ProductForm from './ProductForm';
import NotificationCenter from './NotificationCenter';
import SiteSettings from './SiteSettings';
import OrderManagement from './OrderManagement';

const DashboardOverview = () => {
  const { products, orders, notifications, setProducts, setOrders, setNotifications, setLoading } = useAdmin();
  const [showAddForm, setShowAddForm] = useState(false);
  const [showOrderManagement, setShowOrderManagement] = useState(false);
  const [showNotificationCenter, setShowNotificationCenter] = useState(false);
  const [showSiteSettings, setShowSiteSettings] = useState(false);

  const [filterFromDate, setFilterFromDate] = useState('');
  const [filterToDate, setFilterToDate] = useState('');
  const [filteredOrders, setFilteredOrders] = useState(orders);

  useEffect(() => {
    let filtered = orders;
    if (filterFromDate || filterToDate) {
      const from = filterFromDate ? new Date(filterFromDate) : new Date(0);
      const to = filterToDate ? new Date(filterToDate) : new Date();
      filtered = orders.filter(order => {
        const orderDate = new Date(order.created_at || order.order_date); // Handle DB field
        return orderDate >= from && orderDate <= to;
      });
    }
    setFilteredOrders(filtered);
  }, [orders, filterFromDate, filterToDate]);

  const applyDateFilter = () => {
    toast({ title: 'Filter Applied', description: `Showing orders from ${filterFromDate || 'start'} to ${filterToDate || 'now'}.` });
  };

  const setThisWeek = () => {
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    setFilterFromDate(weekAgo.toISOString().split('T')[0]);
    setFilterToDate(today.toISOString().split('T')[0]);
  };

  // Calculate metrics
  const totalProducts = products.length;
  const totalOrders = filteredOrders.length; // Use filtered
  const totalPayments = filteredOrders.reduce((sum, order) => sum + (order.total_amount || 0), 0);
  const cancelledOrdersPayments = filteredOrders
    .filter(order => order.status === 'canceled')
    .reduce((sum, order) => sum + (order.total_amount || 0), 0);
  const totalRevenue = totalPayments - cancelledOrdersPayments;
  const pendingOrders = filteredOrders.filter(order => order.status === 'pending').length;
  const unreadNotifications = notifications.filter(n => !n.read).length;
  const recentOrders = filteredOrders.slice(0, 5); // Use filtered
  const topProducts = products
    .filter(p => p && p.name && typeof p.rating === 'number')
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, 5);

  const totalCodOrders = filteredOrders.filter(o => o.payment_method === 'COD').length;
  const totalOnlineOrders = filteredOrders.filter(o => o.payment_method === 'online').length;

  const stats = [
    {
      title: 'Total Products',
      value: totalProducts,
      icon: Package,
      color: 'from-blue-500 to-blue-600',
      change: '+12%',
      changeType: 'positive'
    },
    {
      title: 'Total Orders',
      value: totalOrders,
      icon: ShoppingCart,
      color: 'from-green-500 to-green-600',
      change: '+8%',
      changeType: 'positive'
    },
    {
      title: 'Total COD Orders',
      value: totalCodOrders,
      icon: DollarSign,
      color: 'from-yellow-500 to-yellow-600',
      change: '+5%', // Placeholder
      changeType: 'positive'
    },
    {
      title: 'Total Online Orders',
      value: totalOnlineOrders,
      icon: ShoppingCart,
      color: 'from-blue-500 to-blue-600',
      change: '+10%', // Placeholder
      changeType: 'positive'
    },
    {
      title: 'Total Revenue',
      value: `₹${totalRevenue.toFixed(2)}`,
      icon: DollarSign,
      color: 'from-purple-500 to-purple-600',
      change: '+15%',
      changeType: 'positive'
    },
    {
      title: 'Pending Orders',
      value: pendingOrders,
      icon: ShoppingCart,
      color: 'from-orange-500 to-orange-600',
      change: pendingOrders > 0 ? `${pendingOrders} new` : 'All caught up',
      changeType: pendingOrders > 0 ? 'warning' : 'positive'
    }
  ];

  const handleFormClose = () => {
    setShowAddForm(false);
  };

  const handleFormSubmit = () => {
    setShowAddForm(false);
    toast({
      title: "Product Added",
      description: "Product has been added successfully."
    });
  };

  const handleOrderManagementClose = () => {
    setShowOrderManagement(false);
  };

  const handleNotificationCenterClose = () => {
    setShowNotificationCenter(false);
  };

  const handleSiteSettingsClose = () => {
    setShowSiteSettings(false);
  };

  const handleRefresh = async () => {
    try {
      setLoading(true);
      const [ordersRes, productsRes, notificationsRes] = await Promise.all([
        fetch('/api/admin/orders').catch(() => ({ ok: false, json: () => Promise.resolve([]) })),
        fetch('/api/products').catch(() => ({ ok: false, json: () => Promise.resolve([]) })),
        fetch('/api/admin/notifications').catch(() => ({ ok: false, json: () => Promise.resolve([]) }))
      ]);
      if (ordersRes.ok) {
        const o = await ordersRes.json();
        setOrders(Array.isArray(o) ? o : []);
      } else {
        console.warn('Orders fetch failed:', ordersRes.status);
      }
      if (productsRes.ok) {
        const p = await productsRes.json();
        setProducts(Array.isArray(p) ? p : []);
      } else {
        console.warn('Products fetch failed:', productsRes.status);
      }
      if (notificationsRes.ok) {
        const n = await notificationsRes.json();
        setNotifications(Array.isArray(n) ? n : []);
      } else {
        console.warn('Notifications fetch failed:', notificationsRes.status);
      }
      toast({ title: 'Data Refreshed', description: 'Admin data has been reloaded.' });
    } catch (e) {
      console.error('Refresh error:', e.message);
      toast({ title: 'Error', description: 'Failed to refresh data.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Dashboard Overview</h2>
        <p className="text-gray-600">Monitor your store's performance and recent activity</p>
      </div>

      {/* Stats Grid */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
            className={`p-6 rounded-2xl bg-gradient-to-br ${stat.color} text-white shadow-lg`}
          >
            <div className="flex items-center justify-between mb-4">
              <stat.icon className="h-8 w-8" />
              <span className={`text-sm font-medium px-2 py-1 rounded-full ${
                stat.changeType === 'positive' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {stat.change}
              </span>
            </div>
            <h3 className="text-3xl font-bold">{stat.value}</h3>
            <p className="text-white/80 mt-1">{stat.title}</p>
          </motion.div>
        ))}
      </motion.div>
        
      {/* Date Filter */}
      <div className="p-4 bg-gray-50 rounded-lg">
        <h3 className="text-lg font-semibold mb-4">Filter Orders by Date Range</h3>
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">From Date</label>
            <Input
              type="date"
              value={filterFromDate}
              onChange={(e) => setFilterFromDate(e.target.value)}
              className="h-10"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">To Date</label>
            <Input
              type="date"
              value={filterToDate}
              onChange={(e) => setFilterToDate(e.target.value)}
              className="h-10"
            />
          </div>
          <Button onClick={applyDateFilter} className="mb-5 sm:mb-0">Apply Filter</Button>
          <Button variant="outline" onClick={setThisWeek} className="mb-5 sm:mb-0">This Week</Button>
          <Button variant="outline" onClick={() => { setFilterFromDate(''); setFilterToDate(''); }} className="mb-5 sm:mb-0">Clear</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Orders */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Recent Orders</h3>
            <button 
              className="text-sm text-rose-600 hover:text-rose-700 font-medium"
              onClick={() => setShowOrderManagement(true)}
            >
              View All
            </button>
          </div>
          
          <div className="space-y-4">
            {recentOrders.length > 0 ? (
              recentOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gradient-to-r from-rose-500 to-pink-600 rounded-full flex items-center justify-center">
                      <ShoppingCart className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{order.id}</p>
                      <p className="text-sm text-gray-500">{order.customer_name || 'Unknown'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">₹{order.total_amount?.toFixed(2) || '0.00'}</p>
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      order.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                      order.status === 'shipped' ? 'bg-green-100 text-green-800' :
                      order.status === 'completed' ? 'bg-purple-100 text-purple-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {order.status}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                <ShoppingCart className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No orders yet</p>
                <p className="text-sm">Orders will appear here when customers make purchases</p>
              </div>
            )}
          </div>
        </motion.div>

        {/* Top Products */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Top Products</h3>
            <button 
              className="text-sm text-rose-600 hover:text-rose-700 font-medium"
              onClick={() => setShowAddForm(true)}
            >
              View All
            </button>
          </div>
          
          <div className="space-y-4">
            {topProducts.length > 0 ? (
              topProducts.map((product, index) => (
                <div key={product.id} className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg">
                  <div className="w-8 h-8 bg-gradient-to-r from-amber-500 to-orange-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{product.name || 'Unnamed Product'}</p>
                    <div className="flex items-center space-x-2">
                      <div className="flex items-center">
                        <Star className="h-4 w-4 text-yellow-400 fill-current" />
                        <span className="text-sm text-gray-600 ml-1">{product.rating || 0}</span>
                      </div>
                      <span className="text-sm text-gray-500">•</span>
                      <span className="text-sm text-gray-500">₹{product.price?.toFixed(2) || '0.00'}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">{product.category || 'Uncategorized'}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Package className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No products yet</p>
                <p className="text-sm">Add products to see them ranked here</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="mt-8 bg-gradient-to-r from-rose-50 to-pink-50 rounded-xl p-6 border border-rose-200"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <button 
            className="flex items-center justify-center p-4 bg-white rounded-lg border border-rose-200 hover:border-rose-300 hover:shadow-md transition-all"
            onClick={() => setShowAddForm(true)}
          >
            <Plus className="h-5 w-5 text-rose-600 mr-2" />
            <span className="font-medium text-gray-700">Add Product</span>
          </button>
          <button 
            className="flex items-center justify-center p-4 bg-white rounded-lg border border-rose-200 hover:border-rose-300 hover:shadow-md transition-all"
            onClick={() => setShowOrderManagement(true)}
          >
            <ShoppingCart className="h-5 w-5 text-rose-600 mr-2" />
            <span className="font-medium text-gray-700">Process Orders</span>
          </button>
          <button 
            className="flex items-center justify-center p-4 bg-white rounded-lg border border-rose-200 hover:border-rose-300 hover:shadow-md transition-all"
            onClick={() => setShowNotificationCenter(true)}
          >
            <Eye className="h-5 w-5 text-rose-600 mr-2" />
            <span className="font-medium text-gray-700">View Analytics</span>
          </button>
          <button 
            className="flex items-center justify-center p-4 bg-white rounded-lg border border-rose-200 hover:border-rose-300 hover:shadow-md transition-all"
            onClick={() => setShowSiteSettings(true)}
          >
            <Settings className="h-5 w-5 text-rose-600 mr-2" />
            <span className="font-medium text-gray-700">Site Settings</span>
          </button>
          <button 
            className="flex items-center justify-center p-4 bg-white rounded-lg border border-rose-200 hover:border-rose-300 hover:shadow-md transition-all"
            onClick={handleRefresh}
          >
            <RefreshCw className="h-5 w-5 text-rose-600 mr-2" />
            <span className="font-medium text-gray-700" onClick={handleRefresh}>Refresh Data</span>
          </button>
        </div>
      </motion.div>

      {/* Modals */}
      {showAddForm && (
        <ProductForm
          onSubmit={handleFormSubmit}
          onClose={handleFormClose}
        />
      )}
      {showOrderManagement && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={handleOrderManagementClose}>
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <OrderManagement onClose={handleOrderManagementClose} />
          </motion.div>
        </div>
      )}
      {showNotificationCenter && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={handleNotificationCenterClose}>
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <NotificationCenter onClose={handleNotificationCenterClose} />
          </motion.div>
        </div>
      )}
      {showSiteSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={handleSiteSettingsClose}>
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <SiteSettings onClose={handleSiteSettingsClose} />
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default DashboardOverview;