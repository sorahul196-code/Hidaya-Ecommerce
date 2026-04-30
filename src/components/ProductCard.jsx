import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShoppingBag, Heart, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCart } from '@/context/CartContext';
import { useWishlist } from '@/context/WishlistContext';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/components/ui/use-toast';
import { useNavigate } from 'react-router-dom';

const ProductCard = ({ product, index = 0 }) => {
  const { addToCart } = useCart();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const handleAddToCart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    addToCart(product);
    toast({
      title: "Added to Cart! 🛍️",
      description: `${product.name} has been added to your cart.`
    });
  };

  const handleWishlistToggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      toast({
        title: "Login Required",
        description: "Please log in to add items to your wishlist.",
        variant: "destructive"
      });
      navigate('/login');
      return;
    }
    toggleWishlist(product);
  };

  const handleBuyNow = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      toast({ title: "Login Required", description: "Please log in to buy this item.", variant: "destructive" });
      navigate('/login');
      return;
    }
    // For product cards, quantity is always 1
    const buyNowItem = { ...product, quantity: 1 };
    sessionStorage.setItem('buyNowItem', JSON.stringify(buyNowItem));
    navigate('/checkout?buyNow=true');
  };

  const isProductInWishlist = isInWishlist(product.id);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      whileHover={{ y: -5 }}
      className="group"
    >
      <Link to={`/product/${product.id}`}>
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-2xl transition-all duration-300 border border-gray-100">
          {/* Image Container */}
          <div className="relative overflow-hidden aspect-square">
            <img
              src={product.image}
              alt={product.name}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
            />
            
            {/* Overlay Actions */}
            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center space-x-2">
              <Button
                size="icon"
                onClick={handleWishlistToggle}
                className="bg-white/90 text-gray-800 hover:bg-white hover:scale-110 transition-all duration-200"
              >
                <Heart className={`h-4 w-4 ${isProductInWishlist ? 'text-rose-500 fill-current' : ''}`} />
              </Button>
              <Button
                size="icon"
                onClick={handleAddToCart}
                className="bg-rose-600 hover:bg-rose-700 hover:scale-110 transition-all duration-200"
              >
                <ShoppingBag className="h-4 w-4" />
              </Button>
            </div>

            {/* Sale Badge */}
            {product.originalPrice && product.originalPrice > product.price && (
              <div className="absolute top-3 left-3 bg-rose-600 text-white px-2 py-1 rounded-full text-xs font-semibold">
                SALE
              </div>
            )}

            {/* Stock Badge */}
            {!product.inStock && (
              <div className="absolute top-3 right-3 bg-gray-800 text-white px-2 py-1 rounded-full text-xs font-semibold">
                OUT OF STOCK
              </div>
            )}
          </div>

          {/* Product Info */}
          <div className="p-4 space-y-3">
            <div>
              <h3 className="font-semibold text-gray-900 group-hover:text-rose-600 transition-colors line-clamp-2">
                {product.name}
              </h3>
              <p className="text-sm text-gray-500 capitalize">{product.category}</p>
            </div>

            {/* Rating */}
            <div className="flex items-center space-x-1">
              <div className="flex items-center">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={`h-3 w-3 ${
                      i < Math.floor(product.rating)
                        ? 'text-yellow-400 fill-current'
                        : 'text-gray-300'
                    }`}
                  />
                ))}
              </div>
              <span className="text-xs text-gray-500">
                {product.rating} ({product.reviews})
              </span>
            </div>

            {/* Price */}
            <div className="flex items-center space-x-2">
              <span className="text-lg font-bold text-gray-900">
                ₹{product.price}
              </span>
              {product.originalPrice && product.originalPrice > product.price && (
                <span className="text-sm text-gray-500 line-through">
                  ₹{product.originalPrice}
                </span>
              )}
            </div>

            {/* Add to Cart Button */}
            <div className="flex gap-2">
              <Button
                onClick={handleAddToCart}
                disabled={!product.inStock}
                className="w-full bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 disabled:from-gray-400 disabled:to-gray-500"
              >
                {product.inStock ? 'Add to Cart' : 'Out of Stock'}
              </Button>
              <Button
                onClick={handleBuyNow}
                disabled={!product.inStock}
                className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white disabled:from-gray-400 disabled:to-gray-500"
              >
                Buy Now
              </Button>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
};

export default ProductCard;