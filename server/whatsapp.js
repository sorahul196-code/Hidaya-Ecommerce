import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import QRCode from 'qrcode';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Split owner numbers from environment variable (comma-separated)
const ownerMobileEnv = (process.env.OWNER_WHATSAPP_NUMBERS || '').split(',').map(num => num.trim()).filter(Boolean);
console.log('Owner WhatsApp Numbers from env:', ownerMobileEnv);

const sessionDir = path.resolve(__dirname, 'storage', 'wa-session');
async function ensureSessionDir() {
  try { await fs.mkdir(sessionDir, { recursive: true }); } catch {}
}

let qrCodeData = null;
let isClientReady = false;

await ensureSessionDir();

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: sessionDir }),
  puppeteer: { headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] },
});

client.on('qr', async (qr) => {
  try {
    qrCodeData = await QRCode.toDataURL(qr);
    console.log('WhatsApp: QR code updated');
  } catch (e) {
    console.error('WhatsApp: QR generation failed', e.message);
  }
});

client.on('ready', () => { isClientReady = true; console.log('WhatsApp client ready'); });
client.on('authenticated', () => console.log('WhatsApp client authenticated'));
client.on('auth_failure', (m) => console.error('WhatsApp auth failure:', m));
client.on('disconnected', (r) => { console.log('WhatsApp client disconnected:', r); isClientReady = false; });

client.initialize();

function normalizePhone(number) {
  if (!number) return null;
  const trimmed = String(number).trim();
  const normalized = trimmed.startsWith('+') ? trimmed : `+91${trimmed}`;
  console.log(`Normalized phone: ${number} -> ${normalized}`);
  return normalized;
}

async function generatePaymentQRCode(totalAmount, orderId) {
  try {
    const upi = process.env.UPI_ID || 'jewelry@paytm';
    const qrData = `upi://pay?pa=${upi}&am=${totalAmount}&cu=INR&tn=Order ${orderId}&tr=${orderId}`;
    const buf = await QRCode.toBuffer(qrData, { type: 'png', width: 300, margin: 2 });
    return buf;
  } catch (e) {
    console.error('WhatsApp: payment QR generation failed', e.message);
    return null;
  }
}

function formatOrderDetails(orderData) {
  const { customer, items, shipping = 0, tax = 0, total = 0, codSurcharge = 0, paymentMethod } = orderData;
  let message = `🛍️ *Order Confirmation*\n\n`;
  message += `👤 *Customer Details:*\n`;
  message += `Name: ${(customer?.firstName || '')} ${(customer?.lastName || '')}\n`;
  message += `Mobile: ${customer?.mobileNumber || ''}\n`;
  message += `Email: ${customer?.email || 'Not provided'}\n`;
  message += `Address: ${[customer?.address, customer?.city, customer?.state, customer?.zipCode, customer?.country].filter(Boolean).join(', ')}\n\n`;
  message += `📦 *Product Details:*\n`;
  (items || []).forEach((item, index) => {
    const subtotal = Number(item.price || 0) * Number(item.quantity || 0);
    message += `${index + 1}. ${item.name}\n   Qty: ${item.quantity}\n   Price: ₹${Number(item.price || 0).toFixed(2)}\n   Subtotal: ₹${subtotal.toFixed(2)}\n\n`; // Fixed truncation
  });
  const calcSubtotal = (items || []).reduce((s, i) => s + Number(i.price || 0) * Number(i.quantity || 0), 0);
  message += `💰 *Order Summary:*\n`;
  message += `Subtotal: ₹${calcSubtotal.toFixed(2)}\n`;
  message += `Shipping: ₹${Number(shipping).toFixed(2)}\n`;
  message += `Tax: ₹${Number(tax).toFixed(2)}\n`;
  if (codSurcharge > 0) message += `COD Surcharge: ₹${codSurcharge.toFixed(2)}\n`; // NEW: Display surcharge
  message += `*Total: ₹${Number(total).toFixed(2)}*\n\n`;
  if (paymentMethod === 'COD') {
    message += `💳 *Payment Instructions:*\nPayment will be collected in cash upon delivery (includes ₹50 COD fee).\n\n✅ Your order has been placed successfully via Cash on Delivery.\n`; // NEW: COD message
  } else {
    message += `📱 *Payment Instructions:*\nPlease complete your payment using the QR code below or UPI ID: *${process.env.UPI_ID || 'jewelry@paytm'}*\n\n✅ Once payment is confirmed, you'll receive tracking details.\n`;
  }
  message += `📞 For support, contact us at ${process.env.SUPPORT_PHONE || '+91-9876543210'}\n\n`; // Assuming existing
  return message;
}

export async function sendOrderNotification({ orderData, customerMobile, ownerMobiles = ownerMobileEnv, labelFilePath, trackingNumber }) {
  console.log('sendOrderNotification called with:', { orderData, customerMobile, ownerMobiles, labelFilePath, trackingNumber });
  if (!isClientReady) {
    console.error('WhatsApp client not ready');
    throw new Error('WhatsApp client not ready');
  }

  const formattedCustomer = normalizePhone(customerMobile);
  console.log('Customer phone normalized:', formattedCustomer);
  if (formattedCustomer) {
    const chatId = `${formattedCustomer.replace('+', '')}@c.us`;
    console.log('Customer chatId:', chatId);
    const isRegistered = await client.isRegisteredUser(chatId).catch((e) => {
      console.error('Error checking customer registration:', e.message);
      return false;
    });
    console.log('Customer is registered on WhatsApp:', isRegistered);
    if (isRegistered) {
      const userMessage = formatOrderDetails(orderData);
      console.log('Sending customer message:', userMessage);
      await client.sendMessage(chatId, userMessage).catch(e => console.error(`Failed to send to customer:`, e.message));

      // Send QR only for Online
      if (orderData.paymentMethod !== 'COD') {
        console.log('Generating QR for Online payment, total:', orderData.total, 'orderId:', orderData.orderId);
        const qrBuffer = await generatePaymentQRCode(orderData.total, orderData.orderId || Date.now());
        if (qrBuffer) {
          const qrMedia = new MessageMedia('image/png', qrBuffer.toString('base64'), 'payment-qr.png');
          console.log('Sending QR media to customer');
          await client.sendMessage(chatId, qrMedia, { caption: 'Scan to pay via UPI' }).catch(e => console.error('QR send failed:', e.message));
        } else {
          console.error('QR buffer is null');
        }
      }
    } else {
      console.warn(`Customer ${formattedCustomer} is not registered on WhatsApp`);
    }
  } else {
    console.warn('Invalid customer mobile number:', customerMobile);
  }

  // Owner notifications
  for (const ownerNum of ownerMobiles) {
    const formattedOwner = normalizePhone(ownerNum);
    console.log('Owner phone normalized:', formattedOwner);
    if (formattedOwner) {
      const chatId = `${formattedOwner.replace('+', '')}@c.us`;
      console.log('Owner chatId:', chatId);
      const isRegistered = await client.isRegisteredUser(chatId).catch((e) => {
        console.error('Error checking owner registration:', e.message);
        return false;
      });
      console.log('Owner is registered on WhatsApp:', isRegistered);
      if (isRegistered) {
        let ownerMessage = formatOrderDetails(orderData); // Use same formatting for consistency
        console.log('Sending owner message:', ownerMessage);
        await client.sendMessage(chatId, ownerMessage).catch(e => console.error(`Failed to send to owner ${formattedOwner}:`, e.message));

        if (labelFilePath && trackingNumber) {
          console.log('Sending shipping label to owner:', labelFilePath);
          try {
            await sendPdfToNumber({ toMobile: ownerNum, filePath: labelFilePath, caption: `Shipping Label for Order ${trackingNumber}` });
          } catch (e) {
            console.error(`Failed to read or send shipping label for ${formattedOwner}:`, e.message);
          }
        } else {
          console.warn(`No shipping label provided for order ${orderData.orderId || 'unknown'}`);
        }
      } else {
        console.warn(`Owner ${formattedOwner} is not registered on WhatsApp`);
      }
    }
  }

  return { orderId: orderData.orderId || Date.now() };
}

export async function sendPdfToNumber({ toMobile, filePath, caption }) {
  if (!isClientReady) throw new Error('WhatsApp client not ready');
  const formatted = normalizePhone(toMobile);
  if (!formatted) throw new Error('Invalid destination number');
  const chatId = `${formatted.replace('+', '')}@c.us`;
  console.log(`Checking if ${formatted} is registered for PDF send`);
  const isRegistered = await client.isRegisteredUser(chatId).catch(() => false);
  if (!isRegistered) {
    console.warn(`Number ${formatted} is not registered on WhatsApp for PDF send`);
    return false;
  }
  const data = await fs.readFile(filePath);
  const media = new MessageMedia('application/pdf', data.toString('base64'));
  await client.sendMessage(chatId, media, { caption: caption || '' }).catch((e) => {
    console.error(`Failed to send PDF to ${formatted}:`, e.message);
  });
  return true;
}

export async function sendTextToNumber({ toMobile, message }) {
  if (!isClientReady) throw new Error('WhatsApp client not ready');
  const formatted = normalizePhone(toMobile);
  if (!formatted) throw new Error('Invalid destination number');
  const chatId = `${formatted.replace('+', '')}@c.us`;
  console.log(`Checking if ${formatted} is registered for text send`);
  const isRegistered = await client.isRegisteredUser(chatId).catch(() => false);
  if (!isRegistered) {
    console.warn(`Number ${formatted} is not registered on WhatsApp for text send`);
    return false;
  }
  await client.sendMessage(chatId, message).catch((e) => {
    console.error(`Failed to send text to ${formatted}:`, e.message);
  });
  return true;
}

export function mountWhatsAppRoutes(app) {
  const router = express.Router();
  router.get('/status', (req, res) => { res.json({ ready: isClientReady, qrCode: qrCodeData || null }); });
  router.get('/qr', (req, res) => { if (qrCodeData) res.json({ qrCode: qrCodeData }); else res.status(404).json({ error: 'QR code not available' }); });
  router.get('/health', (req, res) => { res.json({ status: 'ok', whatsappReady: isClientReady, timestamp: new Date().toISOString() }); });
  router.post('/send-order-notification', async (req, res) => {
    try {
      const result = await sendOrderNotification({
        orderData: req.body?.orderData,
        customerMobile: req.body?.customerMobile,
        ownerMobiles: req.body?.ownerMobiles,
        labelFilePath: req.body?.labelFilePath,
        trackingNumber: req.body?.trackingNumber
      });
      res.json({ success: true, ...result });
    } catch (e) {
      console.error('Error in send-order-notification:', e.message);
      res.status(503).json({ error: e.message });
    }
  });
  app.use('/api', router);
}

export function getWhatsAppStatus() { return { ready: isClientReady, qr: !!qrCodeData }; }

export { MessageMedia };