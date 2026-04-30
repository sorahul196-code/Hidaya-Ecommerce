import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { toast } from '@/components/ui/use-toast';
import productsData from '@/data/products.json';

const AdminContext = createContext();

export const AdminProvider = ({ children }) => {
  // State management
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [siteSettings, setSiteSettings] = useState({
    logo: '',
    companyName: 'HIDAYA Jewelry',
    contactEmail: 'hidayaquery@gmail.com',
    phone: '+91 77198 77653',
    address: '13, tadiwala road, Pune , Maharashtra , 411001, India',
    heroDescription: "Discover Hidaya’s curated jewelry, where timeless elegance meets affordable luxury. Each piece is thoughtfully selected to embody style and grace.",
    companyDescription: "Discover jewelry that celebrates life’s moments. Each piece is sourced with care, ensuring quality and style at Hidaya.",
    shippingRates: {
      standard: 50,
      express: 15.99,
      overnight: 29.99
    },
    taxRate: 0.00,
    footerText: '© 2024 HIDAYA Jewelry. All rights reserved.'
  });
  const [loading, setLoading] = useState(false);

  // Load data on mount
  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        setLoading(true);
        console.log('Fetching admin data...'); // Debug
        const [ordersRes, productsRes, notificationsRes] = await Promise.all([
          fetch('/api/admin/orders'),
          fetch('/api/products'),
          fetch('/api/admin/notifications').catch(() => ({ ok: false, json: () => Promise.resolve([]) }))
        ]);
        if (!mounted) return;

        // Products
        let p = productsData; // Fallback
        if (productsRes.ok) {
          p = await productsRes.json();
          console.log('Products fetched:', p.length); // Debug
        } else {
          console.warn('Products fetch failed, using fallback');
        }
        setProducts(Array.isArray(p) ? p : []);

        // Orders
        let o = [];
        if (ordersRes.ok) {
          o = await ordersRes.json();
          console.log('Orders fetched:', o.length); // Debug
        } else {
          console.warn('Orders fetch failed:', ordersRes.status);
        }
        setOrders(Array.isArray(o) ? o : []);

        // Notifications
        let n = [];
        if (notificationsRes.ok) {
          n = await notificationsRes.json();
          console.log('Notifications fetched:', n.length); // Debug
        } else {
          console.warn('Notifications fetch failed:', notificationsRes.status);
        }
        setNotifications(Array.isArray(n) ? n : []);

      } catch (e) {
        console.error('Load error:', e.message);
        toast({ title: 'Error', description: 'Failed to load admin data from the server.', variant: 'destructive' });
        if (mounted) setProducts(productsData);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  // Product Management (Persist to backend products.json)
  const addProduct = useCallback(async (productData) => {
    try {
      setLoading(true);
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productData),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Failed to add product');
      }
      const created = await res.json();
      setProducts(prev => [...prev, created]);
      toast({ title: 'Product Added', description: `${created.name} has been saved.` });
    } catch (e) {
      toast({ title: 'Error', description: e.message || 'Failed to add product', variant: 'destructive' });
      throw e;
    } finally { setLoading(false); }
  }, []);

  const updateProduct = useCallback(async (id, updates) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Failed to update product');
      }
      const saved = await res.json();
      setProducts(prev => prev.map(product => product.id === id ? saved : product));
      toast({ title: 'Product Updated', description: 'Product saved.' });
    } catch (e) {
      toast({ title: 'Error', description: e.message || 'Failed to update product', variant: 'destructive' });
      throw e;
    } finally { setLoading(false); }
  }, []);

  const deleteProduct = useCallback(async (id) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Failed to delete product');
      }
      setProducts(prev => prev.filter(p => p.id !== id));
      toast({ title: 'Product Deleted', description: 'Product removed.' });
    } catch (e) {
      toast({ title: 'Error', description: e.message || 'Failed to delete product', variant: 'destructive' });
      throw e;
    } finally { setLoading(false); }
  }, []);

  // Order Management (SQLite backend)
  const addOrder = useCallback(async (orderPayload) => {
    try {
      setLoading(true);
      const res = await fetch('/api/orders/from-cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to create order');
      }
      const created = await res.json(); // <-- Fix: Use res.json() here
      setOrders(prev => [...prev, {
        id: created.orderId,
        user_id: orderPayload.userId || null, // Adjust based on your payload
        status: 'pending',
        total_amount: orderPayload.total,
        items_json: JSON.stringify(orderPayload.items),
        payment_method: orderPayload.paymentMethod,
        created_at: new Date().toISOString(),
        // Add other fields as needed from created
      }]);
      toast({ title: 'Order Created', description: `Order #${created.orderId} created.` });
      return created || { id: created.orderId };
    } catch (e) {
      console.error('Add order error:', e.message);
      toast({ title: 'Error', description: 'Failed to create order', variant: 'destructive' });
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateOrderStatus = useCallback(async (orderId, status, notes = '') => {
    try {
      setLoading(true);
      await fetch(`/api/orders/${orderId}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, notes }) });
      const refreshedRes = await fetch('/api/admin/orders');
      const refreshed = refreshedRes.ok ? await refreshedRes.json() : [];
      setOrders(Array.isArray(refreshed) ? refreshed : []);
      toast({ title: 'Order Updated', description: `Order status updated to ${status}.` });
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to update order', variant: 'destructive' });
      throw e;
    } finally { setLoading(false); }
  }, [orders]);

  // Notification Management
  const markNotificationAsRead = useCallback(async (notificationId) => {
    try {
      await fetch(`/api/admin/notifications/${notificationId}/read`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: true })
      });
      setNotifications(prev => prev.map(n =>
        n.id === notificationId ? { ...n, read: true } : n
      ));
    } catch (e) {
      console.error('Mark notification read error:', e.message);
      toast({ title: 'Error', description: 'Failed to mark notification as read', variant: 'destructive' });
    }
  }, []);

  const clearNotifications = useCallback(async () => {
    try {
      await fetch('/api/admin/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });
      setNotifications([]);
      toast({ title: 'Notifications Cleared', description: 'All notifications have been cleared.' });
    } catch (e) {
      console.error('Clear notifications error:', e.message);
      toast({ title: 'Error', description: 'Failed to clear notifications', variant: 'destructive' });
    }
  }, []);

  // Site Settings Management
  const updateSiteSettings = useCallback((updates) => {
    setSiteSettings(prev => ({ ...prev, ...updates }));
    toast({
      title: "Settings Updated",
      description: "Site settings have been updated successfully."
    });
  }, []);

  // Utility functions
  const getOrderById = useCallback((id) => {
    return orders.find(order => order.id === id);
  }, [orders]);

  const getProductById = useCallback((id) => {
    return products.find(product => product.id === id);
  }, [products]);

  const getUnreadNotificationsCount = useCallback(() => {
    return notifications.filter(n => !n.read).length;
  }, [notifications]);

  const value = {
    // State
    products,
    orders,
    notifications,
    siteSettings,
    loading,
    
    // Product operations
    addProduct,
    updateProduct,
    deleteProduct,
    getProductById,
    
    // Order operations
    addOrder,
    updateOrderStatus,
    getOrderById,
    
    // Notification operations
    markNotificationAsRead,
    clearNotifications,
    getUnreadNotificationsCount,
    
    // Site settings
    updateSiteSettings,
    
    // Utility
    setLoading
  };

  return (
    <AdminContext.Provider value={value}>
      {children}
    </AdminContext.Provider>
  );
};

export const useAdmin = () => {
  const context = useContext(AdminContext);
  if (context === undefined) {
    throw new Error('useAdmin must be used within an AdminProvider');
  }
  return context;
};
