import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CreditCard, Lock, Truck, CheckCircle, Phone, Loader2, Shield, Smartphone, Building, Wallet, MapPin, Plus, Check, MessageCircle, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCart } from '@/context/CartContext';
import { useAdmin } from '@/context/AdminContext';
import { useAuth } from '@/context/AuthContext';
// Odoo removed
import { toast } from '@/components/ui/use-toast';

const Checkout = () => {
  const { items: cartItems, getCartTotal, clearCart } = useCart();
  const { siteSettings, addOrder } = useAdmin();
  const { user, isAuthenticated } = useAuth();
  const [step, setStep] = useState(1);
  const location = useLocation();
  const isBuyNow = new URLSearchParams(location.search).get('buyNow') === 'true';
  const [buyNowItem, setBuyNowItem] = useState(null);
  const items = isBuyNow && buyNowItem ? [buyNowItem] : cartItems;

  const [isProcessing, setIsProcessing] = useState(false);
  const [orderDetails, setOrderDetails] = useState(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('whatsapp');
  const [showWhatsAppConfirmation, setShowWhatsAppConfirmation] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [addressForm, setAddressForm] = useState({
    name: '',
    street: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'India'
  });
  const [formData, setFormData] = useState({
    email: user?.email || '',
    firstName: user?.name?.split(' ')[0] || '',
    lastName: user?.name?.split(' ').slice(1).join(' ') || '',
    mobileNumber: user?.phone || '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'India',
    cardNumber: '',
    expiryDate: '',
    cvv: '',
    nameOnCard: '',
    upiId: '',
    bankName: '',
    accountNumber: ''
  });

  // Get dynamic shipping and tax rates from admin settings
  const shippingRates = siteSettings?.shippingRates || { standard: 5.99, express: 15.99, overnight: 29.99 };
  const taxRate = siteSettings?.taxRate || 0;
  const freeShippingThreshold = siteSettings?.shippingRates?.freeShippingThreshold || 200;

  // Mobile number validation
  const validateMobileNumber = (mobile) => {
    const mobileRegex = /^[6-9]\d{9}$/;
    return mobileRegex.test(mobile);
  };

  const getSubtotal = () => {
    if (isBuyNow && buyNowItem) {
      return buyNowItem.price * buyNowItem.quantity;
    }
    return getCartTotal();
  };

  // Calculate shipping cost
  const getShippingCost = () => {
    const subtotal = getSubtotal();
    if (freeShippingThreshold && subtotal >= freeShippingThreshold) {
      return 0; // Free shipping
    }
    return shippingRates.standard; // Default to standard shipping
  };


  // Calculate tax
  const getTaxAmount = () => {
    return getSubtotal() * taxRate;
  };

  // Calculate total
  const getTotalAmount = () => {
    const baseTotal = getSubtotal() + getShippingCost() + getTaxAmount();
    return selectedPaymentMethod === 'COD' ? baseTotal + 50 : baseTotal;
  };

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const getCodSurcharge = () => selectedPaymentMethod === 'COD' ? 50 : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateMobileNumber(formData.mobileNumber)) {
      toast({
        title: 'Invalid Mobile Number',
        description: 'Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.',
        variant: 'destructive'
      });
      return;
    }
    setIsProcessing(true);
    try {
      const codSurcharge = getCodSurcharge();
      const orderPayload = {
        customer: {
          email: formData.email,
          firstName: formData.firstName,
          lastName: formData.lastName,
          mobileNumber: formData.mobileNumber,
          address: formData.address,
          city: formData.city,
          state: formData.state,
          zipCode: formData.zipCode,
          country: formData.country,
        },
        items: items.map(i => ({ id: i.id, name: i.name, quantity: i.quantity, price: i.price })),
        shipping: getShippingCost(),
        tax: getTaxAmount(),
        codSurcharge,  // New field
        total: getTotalAmount(),  // Includes surcharge
        paymentMethod: selectedPaymentMethod,  // 'COD' or 'Online'
        note: selectedPaymentMethod === 'COD' ? 'Online order via Cash on Delivery' : 'Online order from storefront',
        userId: isAuthenticated ? user.id : null, // Pass logged-in user's ID
      };
      console.log('Submitting order payload:', orderPayload); // Already present
      const result = await addOrder(orderPayload);
      console.log('Order submission result:', result);
      
      console.log('Submitting order payload:', orderPayload);
      
      // Create order in Odoo via AdminContext
      const order = result;
      
      // Generate order number
      const orderNumber = `ORD-${Date.now().toString().slice(-8)}`;
      
      setOrderDetails({
        orderNumber,
        orderId: order?.id || orderNumber,
        customerName: `${formData.firstName} ${formData.lastName}`,
        total: getTotalAmount(),
        items: items.length,
        estimatedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      });
      
      // Show WhatsApp confirmation popup
      setShowWhatsAppConfirmation(true);
      if (isBuyNow) {
        sessionStorage.removeItem('buyNowItem');
      }
      
    } catch (e) {
      console.error('Order submission failed:', e.message);
      toast({
        title: 'Order Failed',
        description: e.message || 'An error occurred while placing the order.',
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const nextStep = () => {
    // Validate current step before proceeding
    if (step === 1) {
      if (!formData.email || !formData.firstName || !formData.lastName || !formData.mobileNumber) {
        toast({ 
          title: 'Missing Information', 
          description: 'Please fill in all required fields.', 
          variant: 'destructive' 
        });
        return;
      }
      if (!validateMobileNumber(formData.mobileNumber)) {
        toast({ 
          title: 'Invalid Mobile Number', 
          description: 'Please enter a valid 10-digit mobile number.', 
          variant: 'destructive' 
        });
        return;
      }
    }
    if (step === 2) {
      if (!formData.address || !formData.city || !formData.state || !formData.zipCode) {
        toast({ 
          title: 'Missing Information', 
          description: 'Please fill in all shipping address fields.', 
          variant: 'destructive' 
        });
        return;
      }
    }
    setStep(step + 1);
  };

  // Load saved addresses for authenticated users
  useEffect(() => {
    if (isAuthenticated && user && !user.isAdmin) {
      loadSavedAddresses();
    }

    if (isBuyNow) {
      const itemJson = sessionStorage.getItem('buyNowItem');
      if (itemJson) {
        setBuyNowItem(JSON.parse(itemJson));
      } else {
        // If buy now item is not in session, redirect to products
        window.location.href = '/products';
      }
    }
  }, [isAuthenticated, user]);

  const loadSavedAddresses = async () => {
    try {
      const addresses = await OdooAddresses.getUserAddresses(user.id);
      setSavedAddresses(addresses);
      
      // Set default address if available
      const defaultAddress = addresses.find(addr => addr.isDefault);
      if (defaultAddress) {
        setSelectedAddress(defaultAddress);
        setFormData(prev => ({
          ...prev,
          address: defaultAddress.street,
          city: defaultAddress.city,
          state: defaultAddress.state,
          zipCode: defaultAddress.zipCode,
          country: defaultAddress.country
        }));
      }
    } catch (error) {
      console.error('Failed to load addresses:', error);
    }
  };

  const handleAddressSelect = (address) => {
    setSelectedAddress(address);
    setFormData(prev => ({
      ...prev,
      address: address.street,
      city: address.city,
      state: address.state,
      zipCode: address.zipCode,
      country: address.country
    }));
  };

  const handleAddNewAddress = async (e) => {
    e.preventDefault();
    
    try {
      const newAddress = await OdooAddresses.addAddress(user.id, addressForm);
      setSavedAddresses(prev => [...prev, newAddress]);
      handleAddressSelect(newAddress);
      setShowAddressForm(false);
      setAddressForm({
        name: '',
        street: '',
        city: '',
        state: '',
        zipCode: '',
        country: 'India'
      });
      
      toast({
        title: "Address Saved",
        description: "New address has been saved for future use."
      });
    } catch (error) {
      toast({
        title: "Failed to save address",
        description: error.message || "Could not save address.",
        variant: "destructive"
      });
    }
  };

  const prevStep = () => {
    setStep(step - 1);
  };

  const paymentMethods = [
    {
      id: 'Online',
      name: 'WhatsApp Payment',
      icon: MessageCircle,
      description: 'Complete your payment via WhatsApp Bot',
      color: 'from-green-500 to-green-600'
    },
    {
      id: 'COD',
      name: 'Cash on Delivery',
      icon: Truck,
      description: 'Pay cash when your order arrives',
      color: 'from-yellow-500 to-yellow-600'
    }
  ];

  if (items.length === 0 && step !== 4) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-amber-50 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center space-y-6 max-w-md mx-auto px-4"
        >
          <div className="text-8xl">🛒</div>
          <h2 className="font-display text-3xl font-bold text-gray-900">No Items to Checkout</h2>
          <p className="text-gray-600">
            Your cart is empty. Add some beautiful jewelry pieces to proceed with checkout.
          </p>
          <Link to="/products">
            <Button className="bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700">
              Start Shopping
            </Button>
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-amber-50">
      {/* Header */}
      <section className="py-16 bg-gradient-to-r from-rose-600 to-pink-700 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center space-y-4"
          >
            <h1 className="font-display text-4xl md:text-6xl font-bold">
              {step === 4 ? 'Order Complete' : 'Checkout'}
            </h1>
            {step !== 4 && (
              <p className="text-xl opacity-90">
                Secure checkout for your jewelry purchase
              </p>
            )}
          </motion.div>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Progress Steps */}
        {step !== 4 && (
          <div className="mb-8">
            <div className="flex justify-between items-center">
              {[1, 2, 3].map((stepNumber) => (
                <div
                  key={stepNumber}
                  className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                    step >= stepNumber
                      ? 'bg-rose-500 border-rose-500 text-white'
                      : 'border-gray-300 text-gray-400'
                  }`}
                >
                  {step > stepNumber ? (
                    <CheckCircle className="h-6 w-6" />
                  ) : (
                    stepNumber
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2 text-sm text-gray-600">
              <span>Contact Info</span>
              <span>Shipping</span>
              <span>Payment</span>
            </div>
          </div>
        )}

        {step === 1 && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="bg-white rounded-2xl shadow-lg p-8"
          >
            <h2 className="text-2xl font-semibold text-gray-900 mb-6">Contact Information</h2>
            <form onSubmit={(e) => { e.preventDefault(); nextStep(); }} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address *
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                  placeholder="your@email.com"
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    First Name *
                  </label>
                  <input
                    type="text"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                    placeholder="John"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                    placeholder="Doe"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Mobile Number *
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="tel"
                    name="mobileNumber"
                    value={formData.mobileNumber}
                    onChange={handleInputChange}
                    required
                    maxLength="10"
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                    placeholder="9876543210"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Enter 10-digit mobile number starting with 6, 7, 8, or 9
                </p>
              </div>
              
              <Button type="submit" className="w-full bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 py-3">
                Continue to Shipping
              </Button>
            </form>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="bg-white rounded-2xl shadow-lg p-8"
          >
            <h2 className="text-2xl font-semibold text-gray-900 mb-6 flex items-center">
              <Truck className="mr-2 h-6 w-6" />
              Shipping Address
            </h2>

            {/* Saved Addresses for Authenticated Users */}
            {isAuthenticated && savedAddresses.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">Saved Addresses</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAddressForm(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add New
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  {savedAddresses.map((address) => (
                    <div
                      key={address.id}
                      onClick={() => handleAddressSelect(address)}
                      className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                        selectedAddress?.id === address.id
                          ? 'border-rose-500 bg-rose-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-medium text-gray-900">{address.name}</h4>
                          {address.isDefault && (
                            <span className="inline-block px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full mt-1">
                              Default
                            </span>
                          )}
                        </div>
                        {selectedAddress?.id === address.id && (
                          <Check className="h-5 w-5 text-rose-500" />
                        )}
                      </div>
                      <div className="text-sm text-gray-600 mt-2">
                        <p>{address.street}</p>
                        <p>{address.city}, {address.state} {address.zipCode}</p>
                        <p>{address.country}</p>
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="flex items-center justify-center">
                  <div className="border-t border-gray-300 flex-grow"></div>
                  <span className="px-4 text-sm text-gray-500">or</span>
                  <div className="border-t border-gray-300 flex-grow"></div>
                </div>
              </div>
            )}

            {/* Add New Address Button for Users with No Saved Addresses */}
            {isAuthenticated && savedAddresses.length === 0 && (
              <div className="mb-6">
                <Button
                  variant="outline"
                  onClick={() => setShowAddressForm(true)}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add New Address
                </Button>
              </div>
            )}

            {/* Address Form */}
            <form onSubmit={(e) => { e.preventDefault(); nextStep(); }} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Street Address *
                </label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                  placeholder="123 Main Street"
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    City *
                  </label>
                  <input
                    type="text"
                    name="city"
                    value={formData.city}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                    placeholder="Mumbai"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    State *
                  </label>
                  <input
                    type="text"
                    name="state"
                    value={formData.state}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                    placeholder="Maharashtra"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    PIN Code *
                  </label>
                  <input
                    type="text"
                    name="zipCode"
                    value={formData.zipCode}
                    onChange={handleInputChange}
                    required
                    maxLength="6"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                    placeholder="400001"
                  />
                </div>
              </div>

              {/* Save Address Option for Authenticated Users */}
              {isAuthenticated && (
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="saveAddress"
                    className="h-4 w-4 text-rose-600 focus:ring-rose-500 border-gray-300 rounded"
                  />
                  <label htmlFor="saveAddress" className="text-sm text-gray-700">
                    Save this address for future orders
                  </label>
                </div>
              )}
              
              <div className="flex space-x-4">
                <Button type="button" variant="outline" onClick={prevStep} className="flex-1">
                  Back
                </Button>
                <Button type="submit" className="flex-1 bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700">
                  Continue to Payment
                </Button>
              </div>
            </form>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-8"
          >
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-6">Payment Method</h2>
              
              {/* Payment Selection */}
              <div className="space-y-4 mb-6">
                <div className="space-y-2">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="whatsapp"
                      checked={selectedPaymentMethod === 'whatsapp'}
                      onChange={(e) => setSelectedPaymentMethod(e.target.value)}
                    />
                    <span className="text-sm text-gray-700">Online Payment (WhatsApp QR)</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="COD"
                      checked={selectedPaymentMethod === 'COD'}
                      onChange={(e) => setSelectedPaymentMethod(e.target.value)}
                      className="rounded"
                    />
                    <span className="text-sm text-gray-700">Cash on Delivery (+₹50 surcharge)</span>
                  </label>
                </div>
              </div>

              {/* Online Payment Details (show only if selected) */}
              {selectedPaymentMethod === 'Online' && (
                <>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <MessageCircle className="mr-2 h-5 w-5 text-green-500" />
                    WhatsApp Payment
                  </h3>
                  
                  {/* WhatsApp Payment Information */}
                  <div className="mb-8">
                    <div className="bg-gradient-to-r from-green-50 to-green-100 border border-green-200 rounded-xl p-6">
                      <div className="flex items-center space-x-4 mb-4">
                        <div className="p-3 bg-green-500 rounded-full">
                          <MessageCircle className="h-6 w-6 text-white" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">Complete Payment via WhatsApp</h3>
                          <p className="text-sm text-gray-600">Secure and convenient payment through WhatsApp Bot</p>
                        </div>
                      </div>
                      
                      <div className="space-y-3 text-sm text-gray-700">
                        <div className="flex items-center space-x-2">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span>Instant order confirmation</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span>QR code for easy payment</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span>Real-time order tracking</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span>WhatsApp notifications</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-start space-x-3">
                      <QrCode className="h-5 w-5 text-blue-500 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-blue-900">How it works:</h4>
                        <ol className="mt-2 text-sm text-blue-800 space-y-1">
                          <li>1. Click "Confirm Order" to place your order</li>
                          <li>2. You'll receive a WhatsApp message with payment details</li>
                          <li>3. Use the QR code or payment link to complete payment</li>
                          <li>4. Get instant confirmation and tracking updates</li>
                        </ol>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* COD Details (show only if selected) */}
              {selectedPaymentMethod === 'COD' && (
                <div className="bg-gradient-to-r from-yellow-50 to-yellow-100 border border-yellow-200 rounded-xl p-6">
                  <div className="flex items-center space-x-4 mb-4">
                    <div className="p-3 bg-yellow-500 rounded-full">
                      <Truck className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Cash on Delivery</h3>
                      <p className="text-sm text-gray-600">Pay when your order arrives</p>
                    </div>
                  </div>
                  
                  <div className="space-y-3 text-sm text-gray-700">
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-yellow-500" />
                      <span>Pay cash to the delivery person</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-yellow-500" />
                      <span>₹50 convenience fee included in total</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-yellow-500" />
                      <span>No advance payment required</span>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="flex items-center space-x-2 text-sm text-gray-600 bg-gray-50 p-4 rounded-lg mt-6">
                <Shield className="h-4 w-4" />
                <span>Your payment will be processed securely {selectedPaymentMethod === 'COD' ? 'upon delivery' : 'through WhatsApp'}</span>
              </div>
              
              <form onSubmit={handleSubmit} className="space-y-6 mt-6">
                <div className="flex space-x-4">
                  <Button type="button" variant="outline" onClick={prevStep} className="flex-1">
                    Back
                  </Button>
                  <Button 
                    type="submit" 
                    className="flex-1 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700"
                    disabled={isProcessing}
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Confirm Order
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </div>

            {/* Order Summary */}
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Order Summary</h3>
              <div className="space-y-4">
                {items.map((item) => (
                  <div key={item.id} className="flex justify-between items-center">
                    <div className="flex items-center space-x-3">
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-12 h-12 rounded-lg object-cover"
                      />
                      <div>
                        <p className="font-medium text-gray-900">{item.name}</p>
                        <p className="text-sm text-gray-500">Qty: {item.quantity}</p>
                      </div>
                    </div>
                    <span className="font-semibold text-gray-900">
                      ₹{(item.price * item.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
                
                <div className="border-t border-gray-200 pt-4 space-y-2">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal</span>
                    <span>₹{getSubtotal().toFixed(2)}</span>  {/* Updated to use getSubtotal() for buyNow support */}
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Shipping</span>
                    <span className={getShippingCost() === 0 ? "text-green-600" : ""}>
                      {getShippingCost() === 0 ? "Free" : `₹${getShippingCost().toFixed(2)}`}
                    </span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Tax</span>
                    <span>₹{getTaxAmount().toFixed(2)}</span>
                  </div>
                  {selectedPaymentMethod === 'COD' && (
                    <div className="flex justify-between text-sm text-gray-600 py-1">
                      <span>COD Surcharge</span>
                      <span>₹50</span>
                    </div>
                  )}
                  {freeShippingThreshold && getSubtotal() < freeShippingThreshold && (
                    <div className="text-sm text-green-600 bg-green-50 p-2 rounded">
                      Add ₹{(freeShippingThreshold - getSubtotal()).toFixed(2)} more for free shipping!
                    </div>
                  )}
                  <div className="flex justify-between text-xl font-bold text-gray-900 pt-2 border-t border-gray-200">
                    <span>Total</span>
                    <span>₹{getTotalAmount().toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {step === 4 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8 }}
            className="text-center space-y-8 bg-white rounded-2xl shadow-lg p-12"
          >
            <div className="text-8xl">🎉</div>
            <div className="space-y-4">
              <div className="flex items-center justify-center space-x-2 text-green-600">
                <CheckCircle className="h-8 w-8" />
                <h2 className="font-display text-3xl font-bold">Order Complete!</h2>
              </div>
              <p className="text-xl text-gray-600">
                Thank you for your purchase! Your beautiful jewelry will be shipped soon.
              </p>
              
              {orderDetails && (
                <div className="bg-gray-50 rounded-lg p-6 mt-6 text-left">
                  <h3 className="font-semibold text-gray-900 mb-4">Order Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Order Number:</span>
                      <p className="font-medium text-gray-900">{orderDetails.orderNumber}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Customer:</span>
                      <p className="font-medium text-gray-900">{orderDetails.customerName}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Total Amount:</span>
                      <p className="font-medium text-gray-900">₹{orderDetails.total.toFixed(2)}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Items:</span>
                      <p className="font-medium text-gray-900">{orderDetails.items} item(s)</p>
                    </div>
                    <div className="md:col-span-2">
                      <span className="text-gray-600">Estimated Delivery:</span>
                      <p className="font-medium text-gray-900">{orderDetails.estimatedDelivery}</p>
                    </div>
                  </div>
                </div>
              )}
              
              <p className="text-gray-500">
                You'll receive a confirmation email with tracking information shortly.
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button onClick={() => {
                  setShowWhatsAppConfirmation(false);
                  setStep(1);
                  <CheckCircle className="h-6 w-6" />
                }}
                className="bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700"
              >
                Continue Shopping
              </Button>
            </div>
          </motion.div>
        )}

        {/* WhatsApp Confirmation Modal */}
        {showWhatsAppConfirmation && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center"
            >
              <div className="text-6xl mb-4">📱</div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Order Placed Successfully!</h3>
              <p className="text-gray-600 mb-6">
                {selectedPaymentMethod === 'COD' 
                  ? 'Your COD order has been placed. Check WhatsApp for confirmation details.' 
                  : 'Your order has been placed. Please check your WhatsApp for payment details and complete the payment.'}
              </p>
              
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-center space-x-2 text-green-700">
                  <MessageCircle className="h-5 w-5" />
                  <span className="font-medium">WhatsApp message sent to {formData.mobileNumber}</span>
                </div>
              </div>
              
              <div className="space-y-3 text-sm text-gray-600 mb-6">
                {selectedPaymentMethod === 'COD' ? (
                  <>
                    <p>• Pay cash upon delivery</p>
                    <p>• Track your order via WhatsApp updates</p>
                    <p>• Contact support if needed</p>
                  </>
                ) : (
                  <>
                    <p>• Check your WhatsApp for payment QR code</p>
                    <p>• Complete payment using UPI or other methods</p>
                    <p>• You'll receive order updates via WhatsApp</p>
                  </>
                )}
              </div>
              
              <Button
                onClick={() => {
                  setShowWhatsAppConfirmation(false);
                  isBuyNow ? sessionStorage.removeItem('buyNowItem') : clearCart();
                  setStep(4);
                }}
                className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700"
              >
                Continue Shopping
              </Button>
            </motion.div>
          </div>
        )}

        {/* Address Form Modal */}
        {showAddressForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Add New Address</h3>
              
              <form onSubmit={handleAddNewAddress} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Address Name</label>
                  <input
                    type="text"
                    value={addressForm.name}
                    onChange={(e) => setAddressForm({ ...addressForm, name: e.target.value })}
                    placeholder="e.g., Home, Office"
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Street Address</label>
                  <input
                    type="text"
                    value={addressForm.street}
                    onChange={(e) => setAddressForm({ ...addressForm, street: e.target.value })}
                    placeholder="123 Main Street"
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
                    <input
                      type="text"
                      value={addressForm.city}
                      onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })}
                      placeholder="Mumbai"
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">State</label>
                    <input
                      type="text"
                      value={addressForm.state}
                      onChange={(e) => setAddressForm({ ...addressForm, state: e.target.value })}
                      placeholder="Maharashtra"
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">ZIP Code</label>
                    <input
                      type="text"
                      value={addressForm.zipCode}
                      onChange={(e) => setAddressForm({ ...addressForm, zipCode: e.target.value })}
                      placeholder="400001"
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Country</label>
                    <input
                      type="text"
                      value={addressForm.country}
                      onChange={(e) => setAddressForm({ ...addressForm, country: e.target.value })}
                      placeholder="India"
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                </div>
                
                <div className="flex space-x-4 pt-4">
                  <Button
                    type="submit"
                    className="flex-1 bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700"
                  >
                    Add Address
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowAddressForm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Checkout;