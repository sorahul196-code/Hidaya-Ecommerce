import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import nodemailer from 'nodemailer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, withTransaction, initSchema, get } from './db.js';
import { mountWhatsAppRoutes, sendPdfToNumber, sendOrderNotification, MessageMedia, getWhatsAppStatus, sendTextToNumber } from './whatsapp.js';
const ADMIN_EMAIL = process.env.VITE_ADMIN_EMAIL || 'hidayaquery@gmail.com';

// Verify OWNER_WHATSAPP_NUMBERS is set
if (!process.env.OWNER_WHATSAPP_NUMBERS) {
  console.warn('WARNING: OWNER_WHATSAPP_NUMBERS environment variable is not set. Owner notifications will not be sent.');
}

const app = express();
app.use(helmet());
app.use(express.json({ limit: '2mb' }));
app.use(cors({ origin: true, credentials: true }));
app.set('trust proxy', 1);

const limiter = rateLimit({ windowMs: 60 * 1000, max: 120 });
app.use('/api/', limiter);

// -----------------------------
// Local products persistence
// -----------------------------
const PRODUCTS_FILE = path.resolve(process.cwd(), 'src', 'data', 'products.json');

async function readProductsFile() {
  try {
    const raw = await fs.readFile(PRODUCTS_FILE, 'utf-8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) throw new Error('products.json is not an array');
    return data;
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

async function writeProductsFile(products) {
  const json = JSON.stringify(products, null, 2);
  await fs.writeFile(PRODUCTS_FILE, json, 'utf-8');
}

function normalizeIncomingProduct(p) {
  return {
    name: p.name || '',
    description: p.description || '',
    price: Number(p.price) || 0,
    originalPrice: p.originalPrice !== undefined ? Number(p.originalPrice) : undefined,
    category: p.category || 'Other',
    image: p.image || '',
    images: p.images && Array.isArray(p.images) ? p.images : [p.image || ''],
    features: Array.isArray(p.features) ? p.features : [],
    inStock: p.inStock !== undefined ? !!p.inStock : true,
    stock: p.stock !== undefined ? Number(p.stock) : undefined,
    rating: p.rating !== undefined && p.rating !== null ? Number(p.rating) : 0,
    reviews: p.reviews !== undefined ? Number(p.reviews) : 0,
    featured: !!p.featured,
  };
}

app.get('/api/products', async (req, res) => {
  try {
    const products = await readProductsFile();
    res.json(products);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const incoming = req.body || {};
    const products = await readProductsFile();
    const nextId = products.length ? Math.max(...products.map(p => Number(p.id) || 0)) + 1 : 1;
    const product = { id: nextId, ...normalizeIncomingProduct(incoming) };
    products.push(product); // Fixed truncation: was 'products.pus...'
    await writeProductsFile(products);
    res.status(201).json(product);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/orders', async (req, res) => {
  const { customer, items, shipping, tax, codSurcharge = 0, total, paymentMethod, note, userId } = req.body;
  
  if (!customer || !items || !total) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const payment_method = paymentMethod === 'COD' ? 'COD' : 'Online'; // Map to DB

  try {
    const result = await withTransaction(async (tx) => {
      // Insert order with payment_method
      const orderResult = await tx.execute(
        `INSERT INTO orders (user_id, customer_json, items_json, shipping_amount, tax_amount, total_amount, payment_method, note, order_date, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 'pending')`,
        [userId, JSON.stringify(customer), JSON.stringify(items), shipping, tax, total, payment_method, note || '']
      );

      const orderId = orderResult.lastID;

      // Insert order items
      for (const item of items) {
        await tx.execute(
          `INSERT INTO order_items (order_id, product_id, name, quantity, price)
           VALUES (?, ?, ?, ?, ?)`,
          [orderId, item.id || null, item.name, item.quantity, item.price]
        );
      }

      // Trigger WhatsApp notification with COD details
      await sendOrderNotification({
        orderData: { customer, items, shipping, tax, total, codSurcharge, paymentMethod },
        customerMobile: customer.mobileNumber,
        ownerMobiles: process.env.OWNER_WHATSAPP_NUMBERS ? process.env.OWNER_WHATSAPP_NUMBERS.split(',') : [],
      }).catch(console.error);

      return { orderId, payment_method }; // Return for frontend
    });

    res.status(201).json(result);
  } catch (e) {
    console.error('Order creation error:', e);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const updates = normalizeIncomingProduct(req.body || {});
    const products = await readProductsFile();
    const idx = products.findIndex(p => Number(p.id) === id);
    if (idx === -1) return res.status(404).json({ error: 'Product not found' });
    const updated = { ...products[idx], ...updates, id };
    products[idx] = updated;
    await writeProductsFile(products);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const products = await readProductsFile();
    const next = products.filter(p => Number(p.id) !== id);
    if (next.length === products.length) return res.status(404).json({ error: 'Product not found' });
    await writeProductsFile(next);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -----------------------------
// SQLite-backed Auth and Users
// -----------------------------
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('Decoded JWT:', decoded); // NEW: Log the decoded payload
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  phone: z.string().min(6).max(20).optional().nullable(),
  address: z.string().optional().nullable(),
  password: z.string().min(6),
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const data = registerSchema.parse(req.body || {});
    const existing = await query('SELECT id FROM users WHERE email = ?', [data.email]);
    if (existing.length) return res.status(409).json({ error: 'Email already registered' });
    
    const passwordHash = await bcrypt.hash(data.password, 10);

    const result = await query(
      'INSERT INTO users (email, name, phone, address, password_hash) VALUES (?, ?, ?, ?, ?)',
      [data.email, data.name, data.phone, data.address || null, passwordHash]
    );
    const userId = result.insertId;
    const token = signToken({ userId, email: data.email });
    res.status(201).json({ token, user: { id: userId, email: data.email, name: data.name, phone: data.phone, address: data.address || null } });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors.map(er => er.message).join(', ') });
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/whatsapp/admin-otp/request', async (req, res) => {
  try {
    const { adminEmail } = req.body;
    if (adminEmail !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Forbidden: Not an admin user.' });
    }

    const ownerNumbers = (process.env.OWNER_WHATSAPP_NUMBERS || '').split(',').map(n => n.trim()).filter(Boolean);
    if (!ownerNumbers.length) {
      return res.status(500).json({ error: 'Owner WhatsApp number not configured on server.' });
    }

    const wa = getWhatsAppStatus();
    if (!wa.ready) return res.status(503).json({ error: 'WhatsApp service unavailable.' });

    const otp = generateOtp();
    const expiresAtSql = "datetime('now', '+5 minutes')";
    await query("INSERT INTO otp_verifications (mobile_number, otp, purpose, expires_at) VALUES (?, ?, ?, " + expiresAtSql + ")", [adminEmail, otp, 'admin_login']);

    const message = `Your Admin Panel OTP is: ${otp}. It is valid for 5 minutes.`;
    for (const number of ownerNumbers) {
      try {
        await sendTextToNumber({ toMobile: number, message });
      } catch (e) {
        console.warn(`Failed to send admin OTP to ${number}:`, e.message);
      }
    }

    res.json({ success: true, message: 'OTP sent to owner(s).' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/whatsapp/admin-otp/verify', async (req, res) => {
  const { adminEmail, otp } = req.body;
  if (adminEmail !== ADMIN_EMAIL) return res.status(403).json({ error: 'Forbidden' });

  const otpRow = await get("SELECT id FROM otp_verifications WHERE mobile_number = ? AND otp = ? AND purpose = 'admin_login' AND expires_at > datetime('now') ORDER BY id DESC LIMIT 1", [adminEmail, otp]);
  if (!otpRow) return res.status(401).json({ error: 'Invalid or expired OTP.' });

  await query('DELETE FROM otp_verifications WHERE id = ?', [otpRow.id]);
  res.json({ success: true, message: 'OTP verified.' });
});

// -----------------------------
// WhatsApp OTP Endpoints
// -----------------------------
const requestOtpSchema = z.object({ phone: z.string().min(6).max(20) });
const registerWithOtpSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  phone: z.string().min(6).max(20),
  address: z.string().optional().nullable(),
  password: z.string().min(6),
  otp: z.string().length(6),
});

const resetPasswordRequestSchema = z.object({ email: z.string().email() });
const resetPasswordVerifySchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
  newPassword: z.string().min(6),
  confirmPassword: z.string().min(6),
});

const otpLimiterRegistration = rateLimit({ windowMs: 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false });
const otpLimiterReset = rateLimit({ windowMs: 60 * 1000, max: 3, standardHeaders: true, legacyHeaders: false });

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function maskPhone(p) {
  const s = String(p || '');
  const last4 = s.slice(-4);
  return `******${last4}`;
}

app.post('/api/auth/request-otp', otpLimiterRegistration, async (req, res) => {
  try {
    const { phone } = requestOtpSchema.parse(req.body || {});
    const exists = await query('SELECT id FROM users WHERE phone = ?', [phone]);
    if (exists.length) return res.status(409).json({ error: 'Phone already registered' });

    const wa = getWhatsAppStatus();
    if (!wa.ready) return res.status(503).json({ error: 'WhatsApp service unavailable' });

    const otp = generateOtp();
    const expiresAtSql = "datetime('now', '+5 minutes')";
    await query('INSERT INTO otp_verifications (mobile_number, otp, purpose, expires_at) VALUES (?, ?, ?, ' + expiresAtSql + ')', [phone, otp, 'registration']);

    // Attempt send via WhatsApp; proceed even if not registered to keep API consistent
    const message = `Your registration OTP is ${otp}. Valid for 5 minutes.`;
    try {
      const sent = await sendTextToNumber({ toMobile: phone, message });
      if (!sent) console.warn('WhatsApp: number not registered for', phone);
    } catch (e) {
      console.warn('WhatsApp send failed (request-otp):', e.message);
    }

    console.log(`OTP sent to ${phone} for registration`);
    res.json({ success: true, message: `OTP sent to ${phone}` });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors.map(er => er.message).join(', ') });
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/register-with-otp', async (req, res) => {
  try {
    const data = registerWithOtpSchema.parse(req.body || {});
    const [emailExisting] = await query('SELECT id FROM users WHERE email = ?', [data.email]);
    if (emailExisting) return res.status(409).json({ error: 'Email already registered' });
    const [phoneExisting] = await query('SELECT id FROM users WHERE phone = ?', [data.phone]);
    if (phoneExisting) return res.status(409).json({ error: 'Phone already registered' });

    const otpRow = await get("SELECT id FROM otp_verifications WHERE mobile_number = ? AND otp = ? AND purpose = 'registration' AND expires_at > datetime('now') ORDER BY id DESC LIMIT 1", [data.phone, data.otp]);
    if (!otpRow) return res.status(401).json({ error: 'Invalid or expired OTP' });

    const passwordHash = await bcrypt.hash(data.password, 10);
    const result = await query('INSERT INTO users (email, name, phone, address, password_hash) VALUES (?, ?, ?, ?, ?)', [data.email, data.name, data.phone, data.address || null, passwordHash]);
    const userId = result.insertId;
    await query('DELETE FROM otp_verifications WHERE id = ?', [otpRow.id]);

    const token = signToken({ userId, email: data.email });
    res.status(201).json({ token, user: { id: userId, email: data.email, name: data.name, phone: data.phone, address: data.address || null } });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors.map(er => er.message).join(', ') });
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/reset-password/request-otp', otpLimiterReset, async (req, res) => {
  try {
    const { email } = resetPasswordRequestSchema.parse(req.body || {});
    const userRows = await query('SELECT id, phone FROM users WHERE email = ?', [email]);
    if (!userRows.length) return res.status(404).json({ error: 'User not found' });
    const phone = userRows[0].phone;
    if (!phone) return res.status(400).json({ error: 'Phone number required' });

    const wa = getWhatsAppStatus();
    if (!wa.ready) return res.status(503).json({ error: 'WhatsApp service unavailable' });

    const otp = generateOtp();
    const expiresAtSql = "datetime('now', '+5 minutes')";
    await query('INSERT INTO otp_verifications (mobile_number, otp, purpose, expires_at) VALUES (?, ?, ?, ' + expiresAtSql + ')', [phone, otp, 'password_reset']);

    try {
      const sent = await sendTextToNumber({ toMobile: phone, message: `Your password reset OTP is ${otp}. Valid for 5 minutes.` });
      if (!sent) console.warn('WhatsApp: number not registered for', phone);
    } catch (e) {
      console.warn('WhatsApp send failed (reset-password/request-otp):', e.message);
    }

    res.json({ success: true, maskedPhone: maskPhone(phone) });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors.map(er => er.message).join(', ') });
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/reset-password/verify-otp', async (req, res) => {
  try {
    const { email, otp, newPassword, confirmPassword } = resetPasswordVerifySchema.parse(req.body || {});
    if (newPassword !== confirmPassword) return res.status(400).json({ error: "Passwords don't match" });
    const userRows = await query('SELECT id, phone FROM users WHERE email = ?', [email]);
    if (!userRows.length) return res.status(404).json({ error: 'User not found' });
    const { id: userId, phone } = userRows[0];
    if (!phone) return res.status(400).json({ error: 'Phone number required' });

    const otpRow = await get("SELECT id FROM otp_verifications WHERE mobile_number = ? AND otp = ? AND purpose = 'password_reset' AND expires_at > datetime('now') ORDER BY id DESC LIMIT 1", [phone, otp]);
    if (!otpRow) return res.status(401).json({ error: 'Authentication failed: Invalid or expired OTP' });

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);
    await query('DELETE FROM otp_verifications WHERE id = ?', [otpRow.id]);
    res.json({ success: true, message: 'Password updated' });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors.map(er => er.message).join(', ') });
    res.status(500).json({ error: e.message });
  }
});

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body || {});
    const rows = await query('SELECT id, email, name, phone, address, password_hash FROM users WHERE email = ?', [email]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const userRow = rows[0];
    const ok = await bcrypt.compare(password, userRow.password_hash);
    const user = { id: userRow.id, email: userRow.email, name: userRow.name, phone: userRow.phone, address: userRow.address };
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = signToken({ userId: user.id, email: user.email });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, phone: user.phone, address: user.address } });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors.map(er => er.message).join(', ') });
    res.status(500).json({ error: e.message });
  }
});

const checkEmailSchema = z.object({ email: z.string().email() });

app.post('/api/auth/check-email', async (req, res) => {
  try {
    const { email } = checkEmailSchema.parse(req.body);
    const user = await get('SELECT id FROM users WHERE email = ?', [email]);
    res.json({ exists: !!user });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors.map(er => er.message).join(', ') });
    res.status(500).json({ error: e.message });
  }
});

const cancelOtps = new Map();

app.post('/api/orders/:id/send-cancel-otp', authMiddleware, async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const userId = req.user.userId;
    const order = await get('SELECT * FROM orders WHERE id = ? AND user_id = ? AND status = "pending"', [orderId, userId]);
    if (!order) return res.status(404).json({ error: 'Pending order not found or you do not own it' });

    const user = await get('SELECT name, email, phone FROM users WHERE id = ?', [userId]);
    if (!user.phone) return res.status(400).json({ error: 'No mobile number on file for OTP' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
    const expires = new Date(Date.now() + 5 * 60 * 1000); // 5 mins
    cancelOtps.set(`${orderId}_${userId}`, { otp, expires });

    // Send OTP via WhatsApp
    await sendTextToNumber({
      toMobile: user.phone,
      message: `Your OTP to cancel Order #${orderId}: ${otp}. Expires in 5 minutes. Do not share.`
    });

    res.json({ success: true, message: 'OTP sent to your mobile' });
  } catch (e) {
    console.error('Error sending cancel OTP:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/orders/:id/verify-cancel-otp', authMiddleware, async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const userId = req.user.userId;
    const { otp, reason } = req.body; // Reason from client
    if (!otp || !reason) return res.status(400).json({ error: 'OTP and reason required' });

    const key = `${orderId}_${userId}`;
    const stored = cancelOtps.get(key);
    if (!stored || stored.otp !== otp || new Date() > stored.expires) {
      cancelOtps.delete(key);
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }
    cancelOtps.delete(key);

    const order = await get('SELECT * FROM orders WHERE id = ? AND user_id = ? AND status = "pending"', [orderId, userId]);
    if (!order) return res.status(404).json({ error: 'Pending order not found or you do not own it' });

    const user = await get('SELECT name, email, phone FROM users WHERE id = ?', [userId]);

    // Cancel order with reason
    await query('UPDATE orders SET status = ?, cancel_reason = ? WHERE id = ?', ['canceled', reason, orderId]);

    // Add admin notification with details
    const notificationMessage = `Order #${orderId} has been cancelled by user ${user.name} (Email: ${user.email}, Mobile: ${user.phone}). Reason: ${reason}`;
    await query(
      'INSERT INTO notifications (type, title, message, order_id, read, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [
        'order_canceled',
        `Order #${orderId} Cancelled`,
        notificationMessage,
        orderId,
        0,
        new Date().toISOString(),
      ]
    );

    // Notify owner via WhatsApp with details
    if (process.env.OWNER_WHATSAPP_NUMBERS) {
      const ownerNumbers = process.env.OWNER_WHATSAPP_NUMBERS.split(',').map(num => num.trim());
      for (const number of ownerNumbers) {
        await sendTextToNumber({
          toMobile: number,
          message: `🔔 Order #${orderId} has been cancelled by user ${user.name} (ID: ${userId}, Email: ${user.email}, Mobile: ${user.phone}). Reason: ${reason}.`
        }).catch(e => console.error(`Failed to notify owner ${number}:`, e.message));
      }
    }

    res.json({ success: true, message: 'Order cancelled successfully' });
  } catch (e) {
    console.error('Error verifying cancel OTP:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/users/me', authMiddleware, async (req, res) => {
  try {
    const rows = await query('SELECT id, email, name, phone, address, created_at FROM users WHERE id = ?', [req.user.userId]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/users/me', authMiddleware, async (req, res) => {
  try {
    const updates = {
      name: typeof req.body?.name === 'string' ? req.body.name : undefined,
      phone: typeof req.body?.phone === 'string' ? req.body.phone : undefined,
      address: typeof req.body?.address === 'string' ? req.body.address : undefined,
    };
    const fields = [];
    const values = [];
    Object.entries(updates).forEach(([k, v]) => { if (v !== undefined) { fields.push(`${k} = ?`); values.push(v); } });
    if (!fields.length) return res.status(400).json({ error: 'No updates provided' });
    values.push(req.user.userId);
    await query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
    const [user] = await query('SELECT id, email, name, phone, address FROM users WHERE id = ?', [req.user.userId]);
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health and root routes to avoid 404 when checking server manually
app.get('/', (req, res) => {
  res.type('text/plain').send('Ecommerce backend is running. See GET /api/health');
});

app.get('/api', (req, res) => {
  res.type('text/plain').send('API root. See GET /api/health');
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, db: 'sqlite' });
});

// Mount WhatsApp unified routes under /api
mountWhatsAppRoutes(app);

async function generateLabelPdfBase64({ orderId, recipientName, addressText, trackingNumber, customerPhone, items }) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([216, 216]); // Square 3 x 3 inches at 72 DPI
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const italicFont = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  const margin = 12;
  const sectionMargin = 6;
  let y = height - margin;

  // Delicate Gold Border
  page.drawRectangle({ x: margin, y: margin, width: width - 2 * margin, height: height - 2 * margin, borderColor: rgb(0.83, 0.69, 0.22), borderWidth: 1 });

  // Top: Logo (PNG Image) and Company Name (Left Side)
  const goldColor = rgb(0.83, 0.69, 0.22);
  let logoImage;
  try {
    const logoPath = path.resolve(process.cwd(), 'server', 'storage', 'logo.png');
    const logoBytes = await fs.readFile(logoPath);
    logoImage = await pdfDoc.embedPng(logoBytes);
    const { width: logoWidth, height: logoHeight } = logoImage.scale(1);
    const maxLogoWidth = 40;
    const maxLogoHeight = 15;
    const scale = Math.min(maxLogoWidth / logoWidth, maxLogoHeight / logoHeight);
    const scaledWidth = logoWidth * scale;
    const scaledHeight = logoHeight * scale;
    page.drawImage(logoImage, { x: margin + 10, y: y - 20, width: scaledWidth, height: scaledHeight });
  } catch (e) {
    console.warn('Failed to load logo, using fallback:', e.message);
    page.drawRectangle({ x: margin + 10, y: y - 20, width: 40, height: 12, color: goldColor, opacity: 0.8 });
    page.drawText("HJ", { x: margin + 18, y: y - 16, size: 7, font: boldFont, color: rgb(1, 1, 1) });
  }
  page.drawText("Hidaya Jewelry", { x: margin + 10, y: y - 35, size: 10, font: italicFont, color: goldColor });
  y -= 50;

  // From Section (Company Details - Small, Right Side at Top)
  page.drawText("From", { x: width - margin - 70, y: height - margin - 7, size: 4, font: boldFont, color: rgb(0, 0, 0) });
  const companyDetails = [
    "Hidaya Jewelry",
    "456 Jewel Lane, Mumbai",
    "Maharashtra, 400001, India",
    "+91 77198 77653",
    "hidayaquery@gmail.com",
    "www.hidaya-jewelry.com"
  ];
  let companyY = height - margin - 15; // Start from top-right
  for (const line of companyDetails) {
    page.drawText(line, { x: width - margin - 70, y: companyY, size: 3, font, maxWidth: 65 });
    companyY -= 5;
  }

  // To Section (Customer Details)
  const addressLines = (addressText || "No address provided").split('\n').map(line => line.trim());
  const addressLineCount = addressLines.length;
  const addressTextHeight = addressLineCount * 6; // 6pt per line
  const toSectionHeight = 15 + addressTextHeight + 6; // Header (7) + name (2) + address + phone (5)
  page.drawRectangle({ x: margin + sectionMargin, y: y - toSectionHeight, width: width - 2 * margin - 2 * sectionMargin, height: toSectionHeight, borderColor: rgb(0.9, 0.9, 0.9), borderWidth: 0.5 });
  page.drawText("To", { x: margin + sectionMargin + 4, y: y - 7, size: 5, font: boldFont, color: rgb(0, 0, 0) });
  page.drawText(recipientName || "Customer", { x: margin + sectionMargin + 4, y: y - 12, size: 4, font });
  let addressY = y - 18;
  for (const line of addressLines) {
    page.drawText(line, { x: margin + sectionMargin + 4, y: addressY, size: 3, font, maxWidth: width - 2 * margin - 2 * sectionMargin - 12 });
    addressY -= 6;
  }
  page.drawText(`Phone: ${customerPhone || "Not provided"}`, { x: margin + sectionMargin + 4, y: addressY, size: 3, font });
  y -= toSectionHeight + 4;

  // Order Information Section
  const orderSectionHeight = 16; // Header (7) + order # (5)
  page.drawRectangle({ x: margin + sectionMargin, y: y - orderSectionHeight, width: width - 2 * margin - 2 * sectionMargin, height: orderSectionHeight, borderColor: rgb(0.9, 0.9, 0.9), borderWidth: 0.5 });
  page.drawText("Order Information", { x: margin + sectionMargin + 4, y: y - 7, size: 5, font: boldFont, color: rgb(0, 0, 0) });
  page.drawText(`Order #: ${orderId}`, { x: margin + sectionMargin + 4, y: y - 12, size: 4, font });
  y -= orderSectionHeight + 4;

  // Bottom: QR Code and Personal Message
  const qrData = await QRCode.toDataURL(`ORDER:${orderId}|TRACK:${trackingNumber}`);
  const qrBase64 = qrData.split(',')[1];
  const qrImage = await pdfDoc.embedPng(Buffer.from(qrBase64, 'base64'));
  const qrDim = 20;
  const bottomY = Math.max(margin + 6, y - 30); // Adjust bottom position based on content
  page.drawImage(qrImage, { x: width - qrDim - margin - sectionMargin, y: bottomY + 10, width: qrDim, height: qrDim });
  page.drawText("Track Order", { x: width - qrDim - margin - sectionMargin, y: bottomY + 3, size: 3, font });
  page.drawText("Thank you for your order! Crafted with care.", { x: margin + sectionMargin, y: bottomY + 3, size: 4, font: italicFont, color: goldColor });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes).toString('base64');
}

// -----------------------------
// SQLite-backed Orders and Admin
// -----------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const storageDir = path.resolve(__dirname, 'storage');
const invoicesDir = path.resolve(storageDir, 'invoices');
const labelsDir = invoicesDir;
async function ensureDirs() {
  try { await fs.mkdir(invoicesDir, { recursive: true }); } catch {}
}

const orderFromCartSchema = z.object({
  customer: z.object({
    name: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().email().optional(),
    mobileNumber: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zipCode: z.string().optional(),
    country: z.string().optional(),
  }),
  items: z.array(z.object({ name: z.string(), price: z.number(), quantity: z.number().int().positive(), productId: z.number().optional() })).min(1),
  shipping: z.number().optional().default(0),
  note: z.string().optional(),
  paymentMethod: z.string().optional(),
  userId: z.number().optional(),
  ownerMobiles: z.array(z.string()).optional(),
});

app.post('/api/orders/from-cart', async (req, res) => {
  let traceId = `trace-${Date.now()}`;
  try {
    await ensureDirs();
    const parsed = orderFromCartSchema.parse(req.body || {});
    const { customer, items, shipping, note, paymentMethod, userId, ownerMobiles } = parsed;
    console.log(`[${traceId}] -- Starting order creation (SQLite) --`);

    let resolvedUserId = Number(userId) || null;
    if (!resolvedUserId && customer?.email) {
      const existing = await query('SELECT id FROM users WHERE email = ?', [customer.email]);
      if (existing.length) {
        resolvedUserId = existing[0].id;
      } else {
        const tempName = `${(customer.firstName || '').trim()} ${(customer.lastName || '').trim()}`.trim() || customer.name || 'Customer';
        const result = await query('INSERT INTO users (email, name, phone, address, password_hash) VALUES (?, ?, ?, ?, ?)', [
          customer.email,
          tempName, 
          customer.mobileNumber || null,
          [customer.address, customer.city, customer.state, customer.zipCode, customer.country].filter(Boolean).join(', ') || null,
          await bcrypt.hash(Math.random().toString(36).slice(2), 10),
        ]);
        resolvedUserId = result.insertId;
      }
    }
    
    // If still no user ID, check if it's the admin placing an order
    if (!resolvedUserId && customer?.email === ADMIN_EMAIL) {
        const adminUser = await get('SELECT id FROM users WHERE email = ?', [ADMIN_EMAIL]);
        if (adminUser) resolvedUserId = adminUser.id;
    }

    const total = items.reduce((sum, i) => sum + Number(i.price) * Number(i.quantity), 0) + Number(shipping || 0);

    const { orderId } = await withTransaction(async (conn) => {
      const orderResult = await conn.execute(
        'INSERT INTO orders (user_id, status, total_amount, items_json, payment_method, order_date) VALUES (?, ?, ?, ?, ?, datetime(\'now\'))',
        [resolvedUserId, 'pending', total, JSON.stringify(items), paymentMethod || 'cod']
      );
      const newOrderId = orderResult.insertId;

      for (const item of items) {
        await conn.execute(
          'INSERT INTO order_items (order_id, product_id, name, quantity, price) VALUES (?, ?, ?, ?, ?)',
          [newOrderId, item.productId || null, item.name, item.quantity, item.price]
        );
      }
      return { orderId: newOrderId };
    });

    let labelUrl = null;
    let filePath = null;
    let trackingNumber = null;
    if (paymentMethod === 'whatsapp') {
      try {
        console.log(`[${traceId}] Generating shipping label for order ${orderId}...`);
        trackingNumber = `TRK${Date.now()}`;
        const address = [customer.address, customer.city, customer.state, customer.zipCode, customer.country].filter(Boolean).join('\n');
        const pdfB64 = await generateLabelPdfBase64({
          orderId,
          recipientName: customer.firstName ? `${customer.firstName} ${customer.lastName || ''}`.trim() : (customer.name || ''),
          addressText: address,
          trackingNumber,
          customerPhone: customer.mobileNumber,
          items
        });
        const buf = Buffer.from(pdfB64, 'base64');
        filePath = path.resolve(labelsDir, `ShippingLabel_${orderId}.pdf`);
        await fs.writeFile(filePath, buf);
        labelUrl = `/api/files/invoices/ShippingLabel_${orderId}.pdf`;
        try {
          await query('UPDATE orders SET shipping_label_url = ? WHERE id = ?', [labelUrl, orderId]);
        } catch {
          await query('UPDATE orders SET invoice_url = ? WHERE id = ?', [labelUrl, orderId]);
        }

        const defaultOwnerMobiles = (process.env.OWNER_WHATSAPP_NUMBERS || '').split(',').map(num => num.trim()).filter(Boolean);
        const payload = { 
          orderData: { customer, items, shipping, tax: 0, total }, 
          customerMobile: customer.mobileNumber, 
          ownerMobiles: ownerMobiles || defaultOwnerMobiles,
          labelFilePath: filePath,
          trackingNumber
        };
        await sendOrderNotification(payload).catch((e) => console.warn(`[${traceId}] WhatsApp notification failed:`, e.message));
      } catch (e) {
        console.warn(`[${traceId}] WhatsApp notification or label generation failed:`, e.message);
      }
    }

    console.log(`[${traceId}] -- Order creation (SQLite) completed successfully --`, { orderId });
    res.json({ orderId, labelUrl });
  } catch (e) {
    console.error(`[${traceId}] -- Order creation (SQLite) failed --`, e.message, e.stack);
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors.map(er => er.message).join(', ') });
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/files/invoices/:name', async (req, res) => {
  try {
    const filePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'storage', 'invoices', req.params.name);
    res.sendFile(filePath);
  } catch (e) {
    res.status(404).json({ error: 'File not found' });
  }
});

// Mirror for shipping labels using same directory
app.get('/api/shipping-labels/:name', async (req, res) => {
  try {
    const filePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'storage', 'invoices', req.params.name);
    res.sendFile(filePath);
  } catch (e) {
    res.status(404).json({ error: 'File not found' });
  }
});

app.get('/api/orders', async (req, res) => {
  try {
    const userHeader = req.headers['x-user-id'];
    if (!userHeader) return res.status(401).json({ error: 'Missing x-user-id' }); // Use order_date instead of created_at
    const rows = await query('SELECT id, user_id, order_date, status, total_amount, payment_method, whatsapp_qr_url, invoice_url FROM orders WHERE user_id = ? ORDER BY id DESC', [userHeader]);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    const userHeader = req.headers['x-user-id'];
    if (!userHeader) return res.status(401).json({ error: 'Missing x-user-id' });
    const order = await query('SELECT * FROM orders WHERE id = ? AND user_id = ?', [req.params.id, userHeader]);
    if (!order || !order.length) return res.status(404).json({ error: 'Order not found' });
    const items = await query('SELECT id, product_id, name, quantity, price, subtotal FROM order_items WHERE order_id = ? ORDER BY id', [req.params.id]);
    const row = { ...order[0], items_json: undefined }; // remove items_json from response
    const allowedStatuses = new Set(['processing','shipped','completed']);
    const includeInvoice = allowedStatuses.has(String(row.status || '').toLowerCase());
    const safeInvoiceUrl = includeInvoice ? row.invoice_url : null;
    res.json({ ...row, invoice_url: safeInvoiceUrl, items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/orders/:id/status', async (req, res) => {
  try {
    const allowed = new Set(['pending', 'processing', 'shipped', 'completed', 'canceled']);
    const status = String(req.body?.status || '').toLowerCase();
    if (!allowed.has(status)) return res.status(400).json({ error: 'Invalid status' });
    await query('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);

    // On confirmation or later, ensure invoice exists and send via WhatsApp
    if (status === 'processing' || status === 'shipped' || status === 'completed') {
      try {
        const [orderRow] = await query('SELECT id, user_id, total_amount FROM orders WHERE id = ?', [req.params.id]);
        if (orderRow) {
          // Generate invoice file if not exists
          const invoiceName = `Invoice_${orderRow.id}.pdf`;
          const invoicePath = path.resolve(invoicesDir, invoiceName);
          let exists = false;
          try { await fs.access(invoicePath); exists = true; } catch {}
          if (!exists) {
            const pdfDoc = await PDFDocument.create();
            const page = pdfDoc.addPage([420, 594]);
            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            page.drawText(`Invoice for Order ${orderRow.id}`, { x: 40, y: 540, size: 18, font });
            page.drawText(`Total Amount: ₹${Number(orderRow.total_amount).toFixed(2)}`, { x: 40, y: 510, size: 12, font });
            const bytes = await pdfDoc.save();
            await fs.writeFile(invoicePath, Buffer.from(bytes));
          }
          const invoiceUrl = `/api/files/invoices/${invoiceName}`;
          await query('UPDATE orders SET invoice_url = ? WHERE id = ?', [invoiceUrl, orderRow.id]);

          try {
            const [userRow] = await query('SELECT phone FROM users WHERE id = ?', [orderRow.user_id]);
            const ownerMobiles = (process.env.OWNER_WHATSAPP_NUMBERS || '').split(',').map(num => num.trim()).filter(Boolean);
            for (const ownerNumber of ownerMobiles) {
              if (ownerNumber) {
                await sendPdfToNumber({ toMobile: ownerNumber, filePath: invoicePath, caption: `📄 Invoice generated for Order ${orderRow.id}` });
                console.log(`Invoice sent to owner ${ownerNumber} for order ${orderRow.id}`);
              }
            }
            if (userRow?.phone) {
              await sendPdfToNumber({ toMobile: userRow.phone, filePath: invoicePath, caption: `✅ Order ${orderRow.id} confirmed! Invoice attached.` });
            }
          } catch (e) {
            console.warn('Invoice WhatsApp send failed:', e.message);
          }
        }
      } catch (e) {
        console.warn('Invoice generation failed:', e.message);
      }
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/orders', async (req, res) => {
  try {
    // Fetch orders with user details
    const orders = await query(`
      SELECT o.*, u.email as customer_email, u.name as customer_name, u.phone as customer_phone, u.address as customer_address
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
    `);
    // Optionally, fetch order items for each order
    for (let order of orders) {
      order.items = await query(
        `SELECT * FROM order_items WHERE order_id = ?`,
        [order.id]
      );
    }
    res.json(orders);
  } catch (e) {
    console.error('Error fetching orders:', e.message);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

app.get('/api/admin/notifications', async (req, res) => {
  try {
    const notifications = await query(`
      SELECT n.*, o.id as orderId
      FROM notifications n
      LEFT JOIN orders o ON n.order_id = o.id
      ORDER BY n.created_at DESC
    `).catch(e => {
      if (e.message.includes('no such table: notifications')) {
        console.warn('Notifications table missing, returning empty array');
        return [];
      }
      throw e;
    });
    res.json(notifications.map(n => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      orderId: n.orderId,
      read: !!n.read,
      createdAt: n.created_at
    })));
  } catch (e) {
    console.error('Error fetching notifications:', e.message);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

app.post('/api/admin/notifications', async (req, res) => {
  try {
    const { type, title, message, orderId } = req.body;
    const result = await run(
      `INSERT INTO notifications (type, title, message, order_id, read) VALUES (?, ?, ?, ?, 0)`,
      [type, title, message, orderId || null]
    );
    res.json({ id: result.lastID, type, title, message, orderId, read: false, createdAt: new Date().toISOString() });
  } catch (e) {
    console.error('Error creating notification:', e.message);
    res.status(500).json({ error: 'Failed to create notification' });
  }
});

app.patch('/api/admin/notifications/:id/read', async (req, res) => {
  try {
    await run(`UPDATE notifications SET read = 1 WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    console.error('Error marking notification read:', e.message);
    res.status(500).json({ error: 'Failed to mark notification read' });
  }
});

app.delete('/api/admin/notifications', async (req, res) => {
  try {
    await run(`DELETE FROM notifications`);
    res.json({ success: true });
  } catch (e) {
    console.error('Error clearing notifications:', e.message);
    res.status(500).json({ error: 'Failed to clear notifications' });
  }
});

app.get('/api/admin/invoices/:orderId', async (req, res) => {
  try {
    const [row] = await query('SELECT id, order_id, pdf_url FROM invoices WHERE order_id = ?', [req.params.orderId]);
    if (!row) return res.status(404).json({ error: 'Invoice not found' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/orders/:id/shipping-label', async (req, res) => {
  try {
    const [row] = await query('SELECT shipping_label_url FROM orders WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Order not found' });
    const relative = row.shipping_label_url || '';
    if (relative) {
      const name = path.basename(relative);
      const filePath = path.resolve(invoicesDir, name);
      try { await fs.unlink(filePath); } catch {}
    }
    await query('UPDATE orders SET shipping_label_url = NULL WHERE id = ?', [req.params.id]);
    console.log(`Shipping label deleted for order ${req.params.id}`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/metrics', async (req, res) => {
  try {
    const [counts, revenueRow, byDay, totalProducts, totalOrders] = await Promise.all([
      query('SELECT status, COUNT(*) as count FROM orders GROUP BY status', []),
      query("SELECT COALESCE(SUM(total_amount),0) as total_revenue FROM orders WHERE status IN ('processing','shipped','completed')", []),
      query("SELECT DATE(order_date) as day, COUNT(*) as orders, SUM(total_amount) as revenue FROM orders GROUP BY DATE(order_date) ORDER BY day DESC LIMIT 30", []),
      readProductsFile().then(p => p.length),
      query("SELECT COUNT(*) as count FROM orders").then(r => r[0].count),
    ]);
    const revenue = Array.isArray(revenueRow) ? (revenueRow[0]?.total_revenue || 0) : 0;
    const metrics = { counts, revenue, byDay, totalProducts, totalOrders };
    res.json(metrics);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/email/send', async (req, res) => {
  try {
    const { to, subject, html, text } = req.body || {};
    if (!process.env.SMTP_HOST) return res.status(400).json({ error: 'SMTP not configured' });
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: !!process.env.SMTP_SECURE,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    const info = await transporter.sendMail({ from: process.env.MAIL_FROM || 'no-reply@example.com', to, subject, html, text });
    res.json({ messageId: info.messageId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Database schema initialization
const schemaSql = `
  -- Drop problematic triggers if they exist
  PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  price REAL NOT NULL DEFAULT 0,
  sku TEXT,
  image TEXT,
  stock INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  order_date TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','shipped','completed','canceled')),
  total_amount REAL NOT NULL DEFAULT 0,
  items_json TEXT NOT NULL,
  payment_method TEXT,
  whatsapp_qr_url TEXT,
  invoice_url TEXT,
  shipping_label_url TEXT,
  cancel_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders(order_date);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  price REAL NOT NULL DEFAULT 0,
  subtotal REAL GENERATED ALWAYS AS (quantity * price) STORED,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);

-- NEW: Add notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  order_id INTEGER,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL UNIQUE,
  pdf_url TEXT,
  pdf_blob BLOB,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- OTP verifications (for registration and password reset)
CREATE TABLE IF NOT EXISTS otp_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mobile_number TEXT NOT NULL,
  otp TEXT NOT NULL,
  purpose TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_otp_mobile ON otp_verifications(mobile_number);
CREATE INDEX IF NOT EXISTS idx_otp_purpose ON otp_verifications(purpose);

-- Optional: materialized daily revenue table for admin charts
CREATE TABLE IF NOT EXISTS revenue_daily (
  day TEXT PRIMARY KEY,
  total_orders INTEGER NOT NULL DEFAULT 0,
  total_revenue REAL NOT NULL DEFAULT 0
);

-- Add to the end of schema.sql
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  order_id INTEGER,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);

-- View for on-the-fly aggregates
DROP VIEW IF EXISTS v_order_status_counts;
CREATE VIEW v_order_status_counts AS
SELECT status, COUNT(*) AS count
FROM orders
GROUP BY status;
`;

// Start server with schema initialization
async function startServer() {
  try {
    await initSchema(schemaSql);
    console.log('Database schema initialized');
    const PORT = Number(process.env.PORT || 4000);
    app.set('trust proxy', 1);

    if (process.env.NODE_ENV === 'production') {
      const distPath = path.resolve(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api')) return next();
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Unified server ready on http://localhost:${PORT}; WhatsApp status: /api/health`);
    });
  } catch (e) {
    console.error('Failed to start server:', e.message);
    process.exit(1);
  }
}

startServer();