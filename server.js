// server.js - Complete Arzona Premium Backend
// Works on any port, HTTP/HTTPS, local or hosting
// Includes FULL Email Functionality

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

const app = express();

// ==================== CORS (Works on all ports/domains) ====================
app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// ==================== SECURITY ====================
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" }, contentSecurityPolicy: false }));
app.use(compression());
app.use(morgan('combined'));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5 });
app.use('/api/users/login', authLimiter);
app.use('/api/users/register', authLimiter);
app.use('/api/admin/login', authLimiter);
app.use('/api/', limiter);

// ==================== DIRECTORIES ====================
const dirs = ['uploads', 'logos', 'frontend', 'books', 'audio', 'go-qrcodes', 'backups'];
dirs.forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
});

app.use(express.static('frontend'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/logos', express.static(path.join(__dirname, 'logos')));
app.use('/books', express.static(path.join(__dirname, 'books')));
app.use('/audio', express.static(path.join(__dirname, 'audio')));

// ==================== DATABASE SCHEMAS ====================
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    mobile: { type: String, required: true },
    userId: { type: String, unique: true, sparse: true },
    userPin: { type: String, unique: true, sparse: true },
    isPremium: { type: Boolean, default: false },
    premiumExpiry: Date,
    purchaseCount: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    addresses: [{
        street: String, city: String, region: String, postalCode: String, isDefault: Boolean
    }],
    wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    cart: [{ product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' }, quantity: Number }],
    library: [{ book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book' }, addedAt: Date, lastAccessed: Date }],
    lastLogin: Date,
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: Date
}, { timestamps: true });

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    category: { type: String, required: true },
    price: { type: Number, required: true },
    stock: { type: Number, default: 0 },
    description: { type: String, required: true },
    imageUrl: String,
    featured: { type: Boolean, default: false },
    discount: { type: Number, default: 0 },
    soldCount: { type: Number, default: 0 },
    availableInGo: { type: Boolean, default: true },
    ratings: [{ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, rating: Number, review: String, date: Date }],
    averageRating: { type: Number, default: 0 }
}, { timestamps: true });

const orderSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    orderType: { type: String, enum: ['normal', 'go'], default: 'normal' },
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
    storeName: String,
    products: [{
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        name: String, quantity: Number, price: Number, imageUrl: String
    }],
    books: [{ book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book' }, name: String, price: Number }],
    subtotal: Number, deliveryFee: Number, total: Number,
    status: { type: String, default: 'Pending', enum: ['Pending', 'Processing', 'Completed', 'Cancelled'] },
    paymentMethod: String, paymentStatus: { type: String, default: 'Pending' },
    trackingNumber: { type: String, unique: true },
    queueNumber: Number,
    customerName: String, customerEmail: String, customerPhone: String,
    deliveryAddress: Object, deliveryType: String,
    notes: String,
    goSession: { type: mongoose.Schema.Types.ObjectId, ref: 'GoSession' },
    deliveredAt: Date,
    estimatedDelivery: Date,
    autoDeleteAfter: { type: Date, default: () => new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) }
}, { timestamps: true });

const bookSchema = new mongoose.Schema({
    title: { type: String, required: true },
    author: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String, required: true },
    coverImage: String,
    pdfUrl: String,
    audioUrl: String,
    duration: String,
    pages: Number,
    publishedYear: Number,
    publisher: String,
    isbn: String,
    language: { type: String, default: 'English' },
    tags: [String],
    featured: { type: Boolean, default: false },
    popularity: { type: Number, default: 0 },
    price: { type: Number, default: 0 },
    isFree: { type: Boolean, default: false },
    ratings: [{ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, rating: Number, review: String, date: Date }],
    averageRating: { type: Number, default: 0 }
}, { timestamps: true });

const storeSchema = new mongoose.Schema({
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    address: String,
    contactNumber: String,
    managerEmail: { type: String, required: true },
    managerName: String,
    managerPassword: { type: String, default: 'manager123' },
    qrCode: String,
    isActive: { type: Boolean, default: true },
    operatingHours: { open: { type: String, default: '09:00' }, close: { type: String, default: '21:00' } }
}, { timestamps: true });

const goSessionSchema = new mongoose.Schema({
    sessionCode: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
    storeName: String,
    status: { type: String, enum: ['active', 'completed', 'expired'], default: 'active' },
    items: [{
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        name: String, quantity: Number, price: Number, imageUrl: String
    }],
    subtotal: Number, total: Number,
    queueNumber: Number,
    customerName: String, customerEmail: String, customerPhone: String,
    expiresAt: { type: Date, default: () => new Date(Date.now() + 2 * 60 * 60 * 1000) },
    completedAt: Date
}, { timestamps: true });

const settingsSchema = new mongoose.Schema({
    logoUrl: String,
    storeName: { type: String, default: 'Arzona Premium' },
    contactEmail: String,
    contactPhone: String,
    adminEmail: { type: String, default: 'admin@arzona.com' },
    deliveryFee: { type: Number, default: 10 },
    freeDeliveryThreshold: { type: Number, default: 100 },
    socialLinks: { facebook: String, instagram: String, twitter: String, whatsapp: String },
    premiumSettings: {
        purchaseThreshold: { type: Number, default: 5 },
        autoUpgrade: { type: Boolean, default: true },
        monthlyPrice: { type: Number, default: 50 },
        yearlyPrice: { type: Number, default: 500 }
    },
    cleanupSettings: { autoDeleteDeliveredOrders: { type: Boolean, default: true }, deleteAfterDays: { type: Number, default: 5 } },
    goSettings: { enabled: { type: Boolean, default: true }, sessionTimeout: { type: Number, default: 120 } }
}, { timestamps: true });

const purchaseSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    products: [{ product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' }, quantity: Number, price: Number, name: String }],
    books: [{ book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book' }, price: Number, title: String }],
    total: { type: Number, required: true },
    purchaseDate: { type: Date, default: Date.now },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    paymentMethod: String
});

const readingProgressSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
    currentPage: Number, progress: Number, lastRead: Date
});

const listeningProgressSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
    currentTime: Number, progress: Number, lastListened: Date
});

const deletedUserArchiveSchema = new mongoose.Schema({
    originalUser: Object,
    deletedBy: String,
    deletedByEmail: String,
    deletedAt: { type: Date, default: Date.now },
    reason: String,
    associatedDataDeleted: { orders: Number, purchases: Number, sessions: Number }
});

const categorySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    type: { type: String, enum: ['product', 'book'], default: 'product' },
    description: String,
    imageUrl: String,
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 }
}, { timestamps: true });

let Product, User, Order, Settings, Category, Book, Purchase, Store, GoSession, DeletedUserArchive, ReadingProgress, ListeningProgress;

function initModels() {
    Product = mongoose.model('Product', productSchema);
    User = mongoose.model('User', userSchema);
    Order = mongoose.model('Order', orderSchema);
    Settings = mongoose.model('Settings', settingsSchema);
    Category = mongoose.model('Category', categorySchema);
    Book = mongoose.model('Book', bookSchema);
    Purchase = mongoose.model('Purchase', purchaseSchema);
    Store = mongoose.model('Store', storeSchema);
    GoSession = mongoose.model('GoSession', goSessionSchema);
    DeletedUserArchive = mongoose.model('DeletedUserArchive', deletedUserArchiveSchema);
    ReadingProgress = mongoose.model('ReadingProgress', readingProgressSchema);
    ListeningProgress = mongoose.model('ListeningProgress', listeningProgressSchema);
}

// ==================== HELPER FUNCTIONS ====================
async function generateUniqueUserId() {
    let userId, unique = false;
    while (!unique) {
        userId = 'ARZ' + crypto.randomBytes(3).toString('hex').toUpperCase();
        if (!(await User.findOne({ userId }))) unique = true;
    }
    return userId;
}

async function generateUniqueUserPin() {
    let pin, unique = false;
    while (!unique) {
        pin = Math.floor(100000 + Math.random() * 900000).toString();
        if (!(await User.findOne({ userPin: pin }))) unique = true;
    }
    return pin;
}

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isValidMobile = (mobile) => /^\+?[0-9]{8,15}$/.test(mobile);

// ==================== NODEMAILER SETUP ====================
let transporter = null;
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporter = nodemailer.createTransport({ 
        service: 'gmail', 
        auth: { 
            user: process.env.EMAIL_USER, 
            pass: process.env.EMAIL_PASS 
        } 
    });
    console.log('✅ Email transporter configured');
} else {
    console.log('⚠️ Email not configured - set EMAIL_USER and EMAIL_PASS in .env');
}

// ==================== EMAIL TEMPLATES ====================

const getWelcomeEmail = (name, userId, userPin, mobile) => `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Welcome to Arzona</title></head>
<body style="font-family: Arial, sans-serif; background: linear-gradient(135deg, #667eea, #764ba2); padding: 20px;">
    <div style="max-width: 500px; margin: auto; background: white; border-radius: 20px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #667eea, #764ba2); padding: 30px; text-align: center; color: white;">
            <h1>✨ ARZONA PREMIUM ✨</h1>
        </div>
        <div style="padding: 30px;">
            <h2>Hello ${name}! 👋</h2>
            <p>Welcome to Arzona Premium! Your account has been created.</p>
            <div style="background: #f0f0f0; padding: 15px; border-radius: 10px; margin: 20px 0;">
                <p><strong>📱 User ID:</strong> ${userId}</p>
                <p><strong>🔐 PIN:</strong> ${userPin}</p>
                <p><strong>📞 Mobile:</strong> ${mobile}</p>
            </div>
            <p>Keep these credentials safe. You'll need them to login.</p>
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 30px; display: inline-block;">Login Now</a>
        </div>
        <div style="background: #f5f5f5; padding: 20px; text-align: center; font-size: 12px; color: #666;">
            <p>Arzona Premium - Your One-Stop Shop</p>
        </div>
    </div>
</body>
</html>
`;

const getRecoveryEmail = (name, newUserId, newUserPin) => `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Account Recovery</title></head>
<body style="font-family: Arial, sans-serif; background: linear-gradient(135deg, #f093fb, #f5576c); padding: 20px;">
    <div style="max-width: 500px; margin: auto; background: white; border-radius: 20px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #f093fb, #f5576c); padding: 30px; text-align: center; color: white;">
            <h1>🔄 Account Recovery</h1>
        </div>
        <div style="padding: 30px;">
            <h2>Hello ${name}! 🔐</h2>
            <p>Your account credentials have been reset as requested.</p>
            <div style="background: #ffe6e6; padding: 15px; border-radius: 10px; margin: 20px 0; text-align: center;">
                <p><strong>🆕 New User ID:</strong> ${newUserId}</p>
                <p><strong>🔑 New PIN:</strong> ${newUserPin}</p>
            </div>
            <p>Please login with your new credentials.</p>
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login" style="background: #f5576c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 30px; display: inline-block;">Login Now</a>
        </div>
        <div style="background: #f5f5f5; padding: 20px; text-align: center; font-size: 12px; color: #666;">
            <p>Arzona Premium - Secure Account Recovery</p>
        </div>
    </div>
</body>
</html>
`;

const getPremiumUpgradeEmail = (name, purchaseCount, expiryDate) => `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Premium Activated</title></head>
<body style="font-family: Arial, sans-serif; background: linear-gradient(135deg, #667eea, #764ba2); padding: 20px;">
    <div style="max-width: 500px; margin: auto; background: white; border-radius: 20px; overflow: hidden; text-align: center;">
        <div style="background: linear-gradient(135deg, #667eea, #764ba2); padding: 30px; color: white;">
            <h1>🎉 PREMIUM ACTIVATED!</h1>
        </div>
        <div style="padding: 30px;">
            <h2>Congratulations ${name}!</h2>
            <p>You've made ${purchaseCount} purchases and have been automatically upgraded to <strong>PREMIUM</strong>!</p>
            <p>Your premium membership is valid until: <strong>${expiryDate}</strong></p>
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/library" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 30px; display: inline-block; margin-top: 20px;">📚 Access Premium Library</a>
        </div>
        <div style="background: #f5f5f5; padding: 20px; font-size: 12px; color: #666;">
            <p>Arzona Premium - Luxury Shopping Experience</p>
        </div>
    </div>
</body>
</html>
`;

const getUserDeletedEmail = (name) => `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Account Deleted</title></head>
<body style="font-family: Arial, sans-serif; background: #f44336; padding: 20px;">
    <div style="max-width: 500px; margin: auto; background: white; border-radius: 20px; overflow: hidden; text-align: center;">
        <div style="background: #f44336; padding: 30px; color: white;">
            <h1>⚠️ Account Deleted</h1>
        </div>
        <div style="padding: 30px;">
            <h2>Dear ${name},</h2>
            <p>Your Arzona Premium account has been deleted by an administrator.</p>
            <p>All your data has been removed from our system.</p>
            <p>If you believe this was a mistake, please contact our support team.</p>
            <a href="mailto:support@arzona.com" style="background: #f44336; color: white; padding: 12px 30px; text-decoration: none; border-radius: 30px; display: inline-block; margin-top: 20px;">Contact Support</a>
        </div>
        <div style="background: #f5f5f5; padding: 20px; font-size: 12px; color: #666;">
            <p>Arzona Premium - Customer Support</p>
        </div>
    </div>
</body>
</html>
`;

const getOrderStatusEmail = (order, status) => `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Order Update</title></head>
<body style="font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px;">
    <div style="max-width: 500px; margin: auto; background: white; border-radius: 20px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #667eea, #764ba2); padding: 20px; text-align: center; color: white;">
            <h1>Order Status Update</h1>
        </div>
        <div style="padding: 30px;">
            <h2>Hello ${order.customerName},</h2>
            <p>Your order <strong>#${order.trackingNumber}</strong> status has been updated to:</p>
            <div style="background: #e8f5e9; padding: 15px; border-radius: 10px; text-align: center;">
                <h2 style="color: #2e7d32;">${status}</h2>
            </div>
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/track/${order.trackingNumber}" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 30px; display: inline-block; margin-top: 20px;">Track Order</a>
        </div>
    </div>
</body>
</html>
`;

// ==================== INITIALIZATION ====================
async function initializeDefaultSettings() {
    if (!(await Settings.findOne())) {
        await Settings.create({
            storeName: 'Arzona Premium', contactEmail: 'support@arzona.com', contactPhone: '+233 59 443 4576',
            adminEmail: process.env.ADMIN_EMAIL || 'admin@arzona.com', deliveryFee: 10, freeDeliveryThreshold: 100,
            premiumSettings: { purchaseThreshold: 5, autoUpgrade: true, monthlyPrice: 50, yearlyPrice: 500 },
            socialLinks: {}, cleanupSettings: { autoDeleteDeliveredOrders: true, deleteAfterDays: 5 }
        });
        console.log('✅ Default settings created');
    }
}

async function initializeDefaultAdmin() {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@arzona.com';
    if (!(await User.findOne({ email: adminEmail }))) {
        await User.create({
            name: 'System Admin', email: adminEmail, mobile: '+233000000000',
            userId: 'ADMIN001', userPin: '000000', isPremium: true, premiumExpiry: new Date('2030-12-31')
        });
        console.log('✅ Default admin created');
    }
}

async function initializeDefaultCategories() {
    if ((await Category.countDocuments()) === 0) {
        await Category.insertMany([
            { name: 'Electronics', type: 'product', active: true, order: 1 },
            { name: 'Fashion', type: 'product', active: true, order: 2 },
            { name: 'Home & Living', type: 'product', active: true, order: 3 },
            { name: 'Books', type: 'book', active: true, order: 4 },
            { name: 'Fiction', type: 'book', active: true, order: 5 },
            { name: 'Audiobooks', type: 'book', active: true, order: 6 }
        ]);
        console.log('✅ Default categories created');
    }
}

async function checkAndUpgradeToPremium(userId) {
    const settings = await Settings.findOne();
    if (!settings?.premiumSettings?.autoUpgrade) return;
    const user = await User.findById(userId);
    if (!user || user.isPremium) return;
    const purchaseCount = await Purchase.countDocuments({ user: userId });
    user.purchaseCount = purchaseCount;
    await user.save();
    if (purchaseCount >= (settings.premiumSettings.purchaseThreshold || 5)) {
        user.isPremium = true;
        const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        user.premiumExpiry = expiryDate;
        user.premiumActivatedAt = new Date();
        await user.save();
        console.log(`🎉 User ${user.email} upgraded to premium after ${purchaseCount} purchases`);
        
        if (transporter && process.env.EMAIL_USER) {
            try {
                await transporter.sendMail({
                    from: `"Arzona Premium" <${process.env.EMAIL_USER}>`,
                    to: user.email,
                    subject: '🎉 Congratulations! You are now a Premium Member!',
                    html: getPremiumUpgradeEmail(user.name, purchaseCount, expiryDate.toDateString())
                });
                console.log(`📧 Premium upgrade email sent to ${user.email}`);
            } catch (emailErr) {
                console.log('Email error:', emailErr.message);
            }
        }
    }
}

// ==================== MULTER ====================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let uploadPath = 'uploads/';
        if (file.fieldname === 'logo') uploadPath = 'logos/';
        else if (file.fieldname === 'pdf') uploadPath = 'books/';
        else if (file.fieldname === 'audio') uploadPath = 'audio/';
        else if (file.fieldname === 'cover') uploadPath = 'uploads/';
        else if (file.fieldname === 'qrCode') uploadPath = 'go-qrcodes/';
        if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
    }
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

// ==================== MIDDLEWARE ====================
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Access token required' });
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        next();
    } catch (err) {
        return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }
};

const isAdmin = (req, res, next) => {
    if (req.user && req.user.isAdmin) return next();
    res.status(403).json({ success: false, message: 'Admin access required' });
};

const requirePremium = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user || !user.isPremium) return res.status(403).json({ success: false, message: 'Premium subscription required' });
        if (user.premiumExpiry && user.premiumExpiry < new Date()) {
            user.isPremium = false;
            await user.save();
            return res.status(403).json({ success: false, message: 'Premium expired' });
        }
        next();
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const extractTokenFromQuery = (req, res, next) => {
    if (req.query.token) {
        try {
            req.user = jwt.verify(req.query.token, process.env.JWT_SECRET || 'your-secret-key');
            return next();
        } catch (err) { return res.status(401).json({ success: false, message: 'Invalid token' }); }
    }
    next();
};

const preventDownload = (req, res, next) => {
    const ua = req.headers['user-agent'] || '';
    if (ua.includes('wget') || ua.includes('curl') || req.query.download === 'true') {
        return res.status(403).json({ success: false, message: 'Downloading not allowed' });
    }
    res.setHeader('Content-Disposition', 'inline');
    next();
};

// ==================== AUTH ROUTES ====================
app.post('/api/admin/login', (req, res) => {
    const { id, pin } = req.body;
    const adminId = process.env.ADMIN_ID || 'ArZoNa1956';
    const adminPin = process.env.ADMIN_PIN || 'YIDA18440594';
    if (id === adminId && pin === adminPin) {
        const token = jwt.sign({ id, isAdmin: true }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '24h' });
        res.json({ success: true, token });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

app.post('/api/users/register', async (req, res) => {
    try {
        const { name, email, mobile } = req.body;
        if (!name || !email || !mobile) return res.status(400).json({ success: false, message: 'All fields required' });
        if (!isValidEmail(email)) return res.status(400).json({ success: false, message: 'Invalid email' });
        if (!isValidMobile(mobile)) return res.status(400).json({ success: false, message: 'Invalid mobile' });
        if (await User.findOne({ email: email.toLowerCase() })) return res.status(400).json({ success: false, message: 'Email already registered' });
        
        const userId = await generateUniqueUserId();
        const userPin = await generateUniqueUserPin();
        const newUser = new User({ name, email: email.toLowerCase(), mobile, userId, userPin, lastLogin: new Date() });
        await newUser.save();
        
        if (transporter && process.env.EMAIL_USER) {
            try {
                await transporter.sendMail({
                    from: `"Arzona Premium" <${process.env.EMAIL_USER}>`,
                    to: email,
                    subject: '🎉 Welcome to Arzona Premium!',
                    html: getWelcomeEmail(name, userId, userPin, mobile)
                });
                console.log(`📧 Welcome email sent to ${email}`);
            } catch (emailErr) {
                console.log('Email error:', emailErr.message);
            }
        }
        
        const token = jwt.sign({ userId: newUser.userId, id: newUser._id }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '7d' });
        res.status(201).json({ success: true, token, user: { id: newUser._id, name, email, userId, isPremium: false } });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

app.post('/api/users/login', async (req, res) => {
    try {
        const { userId, userPin } = req.body;
        const user = await User.findOne({ userId, userPin, isActive: true, isDeleted: false });
        if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });
        user.lastLogin = new Date();
        await user.save();
        const token = jwt.sign({ userId: user.userId, id: user._id }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '7d' });
        res.json({ success: true, token, user: { id: user._id, name: user.name, email: user.email, userId: user.userId, isPremium: user.isPremium, purchaseCount: user.purchaseCount } });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/users/recover-credentials', async (req, res) => {
    try {
        const { email, mobile } = req.body;
        const user = await User.findOne({ email: email.toLowerCase(), mobile, isActive: true });
        if (!user) return res.status(404).json({ success: false, message: 'No account found' });
        
        const newUserId = await generateUniqueUserId();
        const newUserPin = await generateUniqueUserPin();
        user.userId = newUserId;
        user.userPin = newUserPin;
        await user.save();
        
        if (transporter && process.env.EMAIL_USER) {
            try {
                await transporter.sendMail({
                    from: `"Arzona Premium" <${process.env.EMAIL_USER}>`,
                    to: user.email,
                    subject: '🔐 Account Recovery - New Credentials',
                    html: getRecoveryEmail(user.name, newUserId, newUserPin)
                });
                console.log(`📧 Recovery email sent to ${user.email}`);
            } catch (emailErr) {
                console.log('Email error:', emailErr.message);
            }
        }
        
        res.json({ success: true, message: 'New credentials sent to your email' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ==================== ADMIN USERS ====================
app.get('/api/admin/users', authenticateToken, isAdmin, async (req, res) => {
    try {
        const users = await User.find({ isDeleted: false }).select('-resetPasswordToken').sort('-createdAt');
        const usersWithStats = await Promise.all(users.map(async (u) => ({ ...u.toObject(), purchaseCount: await Purchase.countDocuments({ user: u._id }) })));
        res.json({ success: true, users: usersWithStats });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/admin/users/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-resetPasswordToken');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        res.json({ success: true, user });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.delete('/api/admin/users/:userId', authenticateToken, isAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        if (user.email === (process.env.ADMIN_EMAIL || 'admin@arzona.com')) return res.status(403).json({ success: false, message: 'Cannot delete main admin' });
        
        const userEmail = user.email;
        const userName = user.name;
        const ordersCount = await Order.countDocuments({ user: user._id });
        const purchasesCount = await Purchase.countDocuments({ user: user._id });
        const sessionsCount = await GoSession.countDocuments({ user: user._id });
        
        await Order.deleteMany({ user: user._id });
        await Purchase.deleteMany({ user: user._id });
        await GoSession.deleteMany({ user: user._id });
        
        await DeletedUserArchive.create({ originalUser: user.toObject(), deletedBy: req.user.id, deletedAt: new Date(), reason: req.body.reason, associatedDataDeleted: { orders: ordersCount, purchases: purchasesCount, sessions: sessionsCount } });
        
        if (transporter && process.env.EMAIL_USER) {
            try {
                await transporter.sendMail({
                    from: `"Arzona Premium" <${process.env.EMAIL_USER}>`,
                    to: userEmail,
                    subject: 'Arzona Account Deletion Notice',
                    html: getUserDeletedEmail(userName)
                });
                console.log(`📧 Deletion email sent to ${userEmail}`);
            } catch (emailErr) {
                console.log('Email error:', emailErr.message);
            }
        }
        
        await User.findByIdAndDelete(user._id);
        res.json({ success: true, message: 'User deleted permanently' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/admin/deleted-users', authenticateToken, isAdmin, async (req, res) => {
    try {
        const deleted = await DeletedUserArchive.find().sort('-deletedAt').limit(100);
        res.json({ success: true, deletedUsers: deleted });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ==================== ADMIN STATS ====================
app.get('/api/admin/stats', authenticateToken, isAdmin, async (req, res) => {
    try {
        res.json({
            success: true,
            totalOrders: await Order.countDocuments(),
            totalProducts: await Product.countDocuments(),
            totalBooks: await Book.countDocuments(),
            totalUsers: await User.countDocuments({ isDeleted: false }),
            premiumUsers: await User.countDocuments({ isPremium: true }),
            revenue: (await Order.aggregate([{ $match: { paymentStatus: 'Paid' } }, { $group: { _id: null, total: { $sum: '$total' } } }]))[0]?.total || 0,
            popularProducts: await Product.find().sort('-soldCount').limit(5),
            popularBooks: await Book.find().sort('-popularity').limit(5),
            recentOrders: await Order.find().populate('user', 'name').sort('-createdAt').limit(10)
        });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ==================== ADMIN ORDERS ====================
app.get('/api/admin/orders', authenticateToken, isAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const orders = await Order.find().populate('user', 'name email').sort('-createdAt').skip((page - 1) * limit).limit(limit);
        const total = await Order.countDocuments();
        res.json({ success: true, orders, total, currentPage: page, totalPages: Math.ceil(total / limit) });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.put('/api/admin/orders/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        const order = await Order.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
        if (transporter && process.env.EMAIL_USER && order.customerEmail) {
            await transporter.sendMail({
                from: `"Arzona Premium" <${process.env.EMAIL_USER}>`,
                to: order.customerEmail,
                subject: `Order #${order.trackingNumber} Status Update`,
                html: getOrderStatusEmail(order, req.body.status)
            }).catch(err => console.log('Order email error:', err.message));
        }
        res.json({ success: true, order });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ==================== ADMIN PRODUCTS ====================
app.post('/api/admin/products', authenticateToken, isAdmin, upload.single('image'), async (req, res) => {
    try {
        const { name, category, price, stock, description, featured, discount, availableInGo } = req.body;
        if (!name || !category || !price || !description) return res.status(400).json({ success: false, message: 'Missing required fields' });
        const product = new Product({
            name, category, price: parseFloat(price), stock: parseInt(stock) || 0, description,
            imageUrl: req.file ? `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}` : '',
            featured: featured === 'true', discount: parseFloat(discount) || 0, availableInGo: availableInGo === 'true'
        });
        await product.save();
        res.status(201).json({ success: true, product });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

app.put('/api/admin/products/:id', authenticateToken, isAdmin, upload.single('image'), async (req, res) => {
    try {
        const update = req.body;
        if (req.file) update.imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
        const product = await Product.findByIdAndUpdate(req.params.id, update, { new: true });
        res.json({ success: true, product });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

app.delete('/api/admin/products/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        await Product.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ==================== ADMIN BOOKS ====================
app.post('/api/admin/books', authenticateToken, isAdmin, upload.fields([{ name: 'cover' }, { name: 'pdf' }, { name: 'audio' }]), async (req, res) => {
    try {
        const { title, author, description, category, pages, duration, price, isFree, featured } = req.body;
        if (!title || !author || !description || !category) return res.status(400).json({ success: false, message: 'Missing required fields' });
        const book = new Book({
            title, author, description, category,
            coverImage: req.files?.cover ? `${req.protocol}://${req.get('host')}/uploads/${req.files.cover[0].filename}` : '',
            pdfUrl: req.files?.pdf ? `${req.protocol}://${req.get('host')}/books/${req.files.pdf[0].filename}` : '',
            audioUrl: req.files?.audio ? `${req.protocol}://${req.get('host')}/audio/${req.files.audio[0].filename}` : '',
            pages: pages ? parseInt(pages) : undefined, duration, price: parseFloat(price) || 0, isFree: isFree === 'true', featured: featured === 'true'
        });
        await book.save();
        res.status(201).json({ success: true, book });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

app.put('/api/admin/books/:id', authenticateToken, isAdmin, upload.fields([{ name: 'cover' }, { name: 'pdf' }, { name: 'audio' }]), async (req, res) => {
    try {
        const update = req.body;
        if (req.files?.cover) update.coverImage = `${req.protocol}://${req.get('host')}/uploads/${req.files.cover[0].filename}`;
        if (req.files?.pdf) update.pdfUrl = `${req.protocol}://${req.get('host')}/books/${req.files.pdf[0].filename}`;
        if (req.files?.audio) update.audioUrl = `${req.protocol}://${req.get('host')}/audio/${req.files.audio[0].filename}`;
        const book = await Book.findByIdAndUpdate(req.params.id, update, { new: true });
        res.json({ success: true, book });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

app.delete('/api/admin/books/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        await Book.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ==================== ADMIN CATEGORIES ====================
app.get('/api/admin/categories', authenticateToken, isAdmin, async (req, res) => {
    try {
        const categories = await Category.find().sort('order');
        res.json(categories);
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/admin/categories', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { name, type, description, active, order } = req.body;
        if (await Category.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } })) return res.status(400).json({ success: false, message: 'Category exists' });
        const category = new Category({ name, type: type || 'product', description, active: active !== false, order: order || 0 });
        await category.save();
        res.status(201).json(category);
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

app.put('/api/admin/categories/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        const category = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(category);
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

app.delete('/api/admin/categories/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        await Category.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ==================== ADMIN STORES ====================
app.get('/api/admin/stores', authenticateToken, isAdmin, async (req, res) => {
    try {
        const stores = await Store.find();
        res.json(stores);
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/admin/stores', authenticateToken, isAdmin, upload.single('qrCode'), async (req, res) => {
    try {
        const { name, code, address, contactNumber, managerEmail, managerName, managerPassword } = req.body;
        if (await Store.findOne({ code })) return res.status(400).json({ success: false, message: 'Store code exists' });
        const store = new Store({ name, code, address, contactNumber, managerEmail, managerName, managerPassword: managerPassword || 'manager123', isActive: true });
        if (req.file) store.qrCode = `${req.protocol}://${req.get('host')}/go-qrcodes/${req.file.filename}`;
        await store.save();
        res.status(201).json(store);
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

app.put('/api/admin/stores/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        const store = await Store.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(store);
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

app.delete('/api/admin/stores/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        await Store.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ==================== ADMIN PREMIUM ====================
app.get('/api/admin/premium-settings', authenticateToken, isAdmin, async (req, res) => {
    const settings = await Settings.findOne();
    res.json(settings?.premiumSettings || { purchaseThreshold: 5, autoUpgrade: true, monthlyPrice: 50, yearlyPrice: 500 });
});

app.put('/api/admin/premium-settings', authenticateToken, isAdmin, async (req, res) => {
    await Settings.findOneAndUpdate({}, { premiumSettings: req.body }, { upsert: true });
    res.json({ success: true });
});

app.put('/api/admin/premium/toggle/:userId', authenticateToken, isAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        user.isPremium = req.body.isPremium;
        if (req.body.isPremium) user.premiumExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        else user.premiumExpiry = null;
        await user.save();
        res.json({ success: true });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ==================== ADMIN SETTINGS ====================
app.get('/api/settings', async (req, res) => {
    const settings = await Settings.findOne();
    res.json(settings || {});
});

app.put('/api/admin/settings', authenticateToken, isAdmin, async (req, res) => {
    const settings = await Settings.findOneAndUpdate({}, req.body, { new: true, upsert: true });
    res.json(settings);
});

app.post('/api/admin/logo', authenticateToken, isAdmin, upload.single('logo'), async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file' });
    const logoUrl = `${req.protocol}://${req.get('host')}/logos/${req.file.filename}`;
    await Settings.findOneAndUpdate({}, { logoUrl }, { upsert: true });
    res.json({ success: true, logoUrl });
});

// ==================== PUBLIC PRODUCTS ====================
app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find().sort('-createdAt');
        res.json(products);
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/products/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ success: false, message: 'Not found' });
        res.json(product);
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ==================== PUBLIC BOOKS ====================
app.get('/api/books', async (req, res) => {
    try {
        const books = await Book.find().sort('-createdAt');
        res.json(books);
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/books/:id', async (req, res) => {
    try {
        const book = await Book.findById(req.params.id);
        if (!book) return res.status(404).json({ success: false, message: 'Not found' });
        book.popularity += 1;
        await book.save();
        res.json(book);
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ==================== PUBLIC CATEGORIES ====================
app.get('/api/categories', async (req, res) => {
    try {
        const { type } = req.query;
        const query = { active: true };
        if (type) query.type = type;
        const categories = await Category.find(query).sort('order');
        res.json({ success: true, categories });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ==================== PUBLIC STORES ====================
app.get('/api/stores', async (req, res) => {
    try {
        const stores = await Store.find({ isActive: true }).select('-managerPassword');
        res.json({ success: true, stores });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ==================== USER PROFILE ====================
app.get('/api/users/profile', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).populate('wishlist').populate('cart.product').populate('library.book');
        res.json(user);
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.put('/api/users/profile', authenticateToken, async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(req.user.id, { name: req.body.name, mobile: req.body.mobile }, { new: true });
        res.json(user);
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

app.put('/api/users/change-pin', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (user.userPin !== req.body.currentPin) return res.status(400).json({ success: false, message: 'Current PIN incorrect' });
        if (!/^\d{6}$/.test(req.body.newPin)) return res.status(400).json({ success: false, message: 'PIN must be 6 digits' });
        user.userPin = req.body.newPin;
        await user.save();
        res.json({ success: true });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ==================== USER ADDRESSES ====================
app.post('/api/users/addresses', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (req.body.isDefault) user.addresses.forEach(a => a.isDefault = false);
        user.addresses.push(req.body);
        await user.save();
        res.json(user.addresses);
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

app.put('/api/users/addresses/:index', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const idx = parseInt(req.params.index);
        if (idx < 0 || idx >= user.addresses.length) return res.status(400).json({ success: false, message: 'Invalid index' });
        if (req.body.isDefault) user.addresses.forEach((a, i) => a.isDefault = (i === idx));
        user.addresses[idx] = { ...user.addresses[idx].toObject(), ...req.body };
        await user.save();
        res.json(user.addresses);
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

app.delete('/api/users/addresses/:index', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        user.addresses.splice(parseInt(req.params.index), 1);
        await user.save();
        res.json(user.addresses);
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ==================== USER CART ====================
app.get('/api/users/cart', authenticateToken, async (req, res) => {
    const user = await User.findById(req.user.id).populate('cart.product');
    res.json(user.cart);
});

app.post('/api/users/cart', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const existing = user.cart.find(i => i.product.toString() === req.body.productId);
        if (existing) existing.quantity += req.body.quantity;
        else user.cart.push({ product: req.body.productId, quantity: req.body.quantity });
        await user.save();
        await user.populate('cart.product');
        res.json(user.cart);
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

app.put('/api/users/cart/:productId', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const item = user.cart.find(i => i.product.toString() === req.params.productId);
        if (!item) return res.status(404).json({ success: false, message: 'Item not found' });
        if (req.body.quantity <= 0) user.cart = user.cart.filter(i => i.product.toString() !== req.params.productId);
        else item.quantity = req.body.quantity;
        await user.save();
        await user.populate('cart.product');
        res.json(user.cart);
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

app.delete('/api/users/cart/:productId', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        user.cart = user.cart.filter(i => i.product.toString() !== req.params.productId);
        await user.save();
        res.json({ success: true });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

app.delete('/api/users/cart', authenticateToken, async (req, res) => {
    const user = await User.findById(req.user.id);
    user.cart = [];
    await user.save();
    res.json({ success: true });
});

// ==================== USER WISHLIST ====================
app.get('/api/users/wishlist', authenticateToken, async (req, res) => {
    const user = await User.findById(req.user.id).populate('wishlist');
    res.json(user.wishlist);
});

app.post('/api/users/wishlist/:productId', authenticateToken, async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user.wishlist.includes(req.params.productId)) user.wishlist.push(req.params.productId);
    await user.save();
    res.json({ success: true });
});

app.delete('/api/users/wishlist/:productId', authenticateToken, async (req, res) => {
    const user = await User.findById(req.user.id);
    user.wishlist = user.wishlist.filter(id => id.toString() !== req.params.productId);
    await user.save();
    res.json({ success: true });
});

// ==================== USER ORDERS ====================
app.post('/api/orders', authenticateToken, async (req, res) => {
    try {
        const { products, deliveryAddress, paymentMethod, deliveryType, notes } = req.body;
        if (!products?.length) return res.status(400).json({ success: false, message: 'No products' });
        
        let subtotal = 0;
        const orderProducts = [];
        for (const item of products) {
            const product = await Product.findById(item.product);
            if (!product) return res.status(400).json({ success: false, message: 'Product not found' });
            if (product.stock < item.quantity) return res.status(400).json({ success: false, message: `Insufficient stock for ${product.name}` });
            const price = product.price * (1 - (product.discount || 0) / 100);
            subtotal += price * item.quantity;
            orderProducts.push({ product: product._id, name: product.name, quantity: item.quantity, price, imageUrl: product.imageUrl });
            product.stock -= item.quantity;
            await product.save();
        }
        
        const settings = await Settings.findOne();
        const deliveryFee = deliveryType === 'Delivery' ? (settings?.deliveryFee || 10) : 0;
        const total = subtotal + deliveryFee;
        const trackingNumber = 'ARZ' + Date.now() + crypto.randomBytes(2).toString('hex').toUpperCase();
        const user = await User.findById(req.user.id);
        
        const order = new Order({
            user: req.user.id, products: orderProducts, subtotal, deliveryFee, total,
            deliveryAddress, paymentMethod, deliveryType, trackingNumber, notes,
            paymentStatus: paymentMethod === 'Cash on Delivery' ? 'Pending' : 'Paid',
            customerName: user.name, customerEmail: user.email, customerPhone: user.mobile
        });
        await order.save();
        await Purchase.create({ user: req.user.id, products: orderProducts, total, orderId: order._id, paymentMethod });
        await User.findByIdAndUpdate(req.user.id, { cart: [] });
        await checkAndUpgradeToPremium(req.user.id);
        res.status(201).json({ success: true, order });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

app.get('/api/orders/my-orders', authenticateToken, async (req, res) => {
    const orders = await Order.find({ user: req.user.id }).sort('-createdAt');
    res.json({ success: true, orders });
});

app.get('/api/orders/:trackingNumber/track', async (req, res) => {
    const order = await Order.findOne({ trackingNumber: req.params.trackingNumber });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, status: order.status, trackingNumber: order.trackingNumber });
});

// ==================== PREMIUM LIBRARY ====================
app.get('/api/user/library', authenticateToken, requirePremium, async (req, res) => {
    const user = await User.findById(req.user.id).populate('library.book');
    res.json(user.library);
});

app.get('/api/library/books/:id/read', extractTokenFromQuery, authenticateToken, requirePremium, preventDownload, async (req, res) => {
    const book = await Book.findById(req.params.id);
    if (!book || !book.pdfUrl) return res.status(404).json({ success: false, message: 'PDF not found' });
    const filePath = path.join(__dirname, 'books', path.basename(book.pdfUrl));
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'File not found' });
    res.sendFile(filePath);
});

app.get('/api/library/books/:id/listen', extractTokenFromQuery, authenticateToken, requirePremium, preventDownload, async (req, res) => {
    const book = await Book.findById(req.params.id);
    if (!book || !book.audioUrl) return res.status(404).json({ success: false, message: 'Audio not found' });
    const filePath = path.join(__dirname, 'audio', path.basename(book.audioUrl));
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'File not found' });
    res.sendFile(filePath);
});

// ==================== READING/LISTENING PROGRESS ====================
app.post('/api/library/books/:id/progress/read', authenticateToken, requirePremium, async (req, res) => {
    const { currentPage, progress } = req.body;
    let existing = await ReadingProgress.findOne({ user: req.user.id, book: req.params.id });
    if (existing) { existing.currentPage = currentPage; existing.progress = progress; existing.lastRead = new Date(); await existing.save(); }
    else { await ReadingProgress.create({ user: req.user.id, book: req.params.id, currentPage, progress }); }
    res.json({ success: true });
});

app.get('/api/library/books/:id/progress/read', authenticateToken, requirePremium, async (req, res) => {
    const progress = await ReadingProgress.findOne({ user: req.user.id, book: req.params.id });
    res.json(progress || { currentPage: 0, progress: 0 });
});

app.post('/api/library/books/:id/progress/listen', authenticateToken, requirePremium, async (req, res) => {
    const { currentTime, progress } = req.body;
    let existing = await ListeningProgress.findOne({ user: req.user.id, book: req.params.id });
    if (existing) { existing.currentTime = currentTime; existing.progress = progress; existing.lastListened = new Date(); await existing.save(); }
    else { await ListeningProgress.create({ user: req.user.id, book: req.params.id, currentTime, progress }); }
    res.json({ success: true });
});

app.get('/api/library/books/:id/progress/listen', authenticateToken, requirePremium, async (req, res) => {
    const progress = await ListeningProgress.findOne({ user: req.user.id, book: req.params.id });
    res.json(progress || { currentTime: 0, progress: 0 });
});

// ==================== BOOK RATINGS ====================
app.post('/api/books/:id/ratings', authenticateToken, async (req, res) => {
    try {
        const { rating, review } = req.body;
        if (!rating || rating < 1 || rating > 5) return res.status(400).json({ success: false, message: 'Rating must be 1-5' });
        const book = await Book.findById(req.params.id);
        if (!book) return res.status(404).json({ success: false, message: 'Book not found' });
        const existing = book.ratings.find(r => r.user.toString() === req.user.id);
        if (existing) { existing.rating = rating; existing.review = review; existing.date = new Date(); }
        else { book.ratings.push({ user: req.user.id, rating, review }); }
        book.averageRating = book.ratings.reduce((s, r) => s + r.rating, 0) / book.ratings.length;
        await book.save();
        res.json({ success: true, averageRating: book.averageRating, ratings: book.ratings });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

app.get('/api/books/:id/ratings', async (req, res) => {
    const book = await Book.findById(req.params.id).populate('ratings.user', 'name');
    if (!book) return res.status(404).json({ success: false, message: 'Book not found' });
    res.json({ success: true, ratings: book.ratings, averageRating: book.averageRating });
});

// ==================== PREMIUM SUBSCRIPTION ====================
app.post('/api/user/premium/subscribe', authenticateToken, async (req, res) => {
    try {
        const { months = 1, paymentMethod } = req.body;
        const settings = await Settings.findOne();
        const price = months === 12 ? (settings?.premiumSettings?.yearlyPrice || 500) : (settings?.premiumSettings?.monthlyPrice || 50) * months;
        const trackingNumber = 'PRM' + Date.now() + crypto.randomBytes(2).toString('hex').toUpperCase();
        const order = new Order({
            user: req.user.id, products: [], books: [], subtotal: price, total: price,
            paymentMethod, paymentStatus: paymentMethod === 'Cash on Delivery' ? 'Pending' : 'Paid',
            deliveryType: 'Digital', trackingNumber, notes: `Premium Subscription - ${months} month(s)`, status: 'Pending'
        });
        await order.save();
        if (paymentMethod !== 'Cash on Delivery') {
            const user = await User.findById(req.user.id);
            const expiry = new Date();
            expiry.setMonth(expiry.getMonth() + months);
            user.isPremium = true;
            user.premiumExpiry = expiry;
            user.premiumActivatedAt = new Date();
            await user.save();
            order.status = 'Completed';
            order.paymentStatus = 'Paid';
            await order.save();
        }
        res.json({ success: true, order });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ==================== ARZONA GO SESSIONS ====================
app.post('/api/go/start-session', authenticateToken, async (req, res) => {
    try {
        const { storeCode } = req.body;
        const store = await Store.findOne({ code: storeCode, isActive: true });
        if (!store) return res.status(404).json({ success: false, message: 'Store not found' });
        
        const existing = await GoSession.findOne({ user: req.user.id, status: 'active' });
        if (existing && existing.expiresAt > new Date()) {
            return res.json({ success: true, existingSession: true, sessionCode: existing.sessionCode, queueNumber: existing.queueNumber });
        }
        
        const sessionCode = 'GO' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 4).toUpperCase();
        const sessionCount = await GoSession.countDocuments({ store: store._id, createdAt: { $gte: new Date().setHours(0, 0, 0, 0) } });
        const user = await User.findById(req.user.id);
        const session = new GoSession({
            sessionCode, user: req.user.id, store: store._id, storeName: store.name,
            queueNumber: sessionCount + 1, customerName: user.name, customerEmail: user.email, customerPhone: user.mobile,
            expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000)
        });
        await session.save();
        res.json({ success: true, sessionCode, queueNumber: session.queueNumber });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

app.post('/api/go/session/:code/items', authenticateToken, async (req, res) => {
    try {
        const { productId, quantity } = req.body;
        const session = await GoSession.findOne({ sessionCode: req.params.code, status: 'active', user: req.user.id });
        if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
        if (session.expiresAt < new Date()) {
            session.status = 'expired';
            await session.save();
            return res.status(400).json({ success: false, message: 'Session expired' });
        }
        const product = await Product.findById(productId);
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
        if (!product.availableInGo) return res.status(400).json({ success: false, message: 'Product not available for Go' });
        
        const existing = session.items.find(i => i.product.toString() === productId);
        if (existing) existing.quantity += quantity;
        else session.items.push({ product: productId, name: product.name, quantity, price: product.price, imageUrl: product.imageUrl });
        
        session.subtotal = session.items.reduce((s, i) => s + (i.price * i.quantity), 0);
        session.total = session.subtotal;
        await session.save();
        res.json({ success: true, session });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

app.get('/api/go/session/:code', authenticateToken, async (req, res) => {
    const session = await GoSession.findOne({ sessionCode: req.params.code, user: req.user.id }).populate('items.product');
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    res.json({ success: true, session });
});

app.post('/api/go/session/:code/checkout', authenticateToken, async (req, res) => {
    try {
        const session = await GoSession.findOne({ sessionCode: req.params.code, status: 'active', user: req.user.id });
        if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
        if (!session.items.length) return res.status(400).json({ success: false, message: 'No items' });
        
        const trackingNumber = 'GO' + Date.now() + crypto.randomBytes(2).toString('hex').toUpperCase();
        const user = await User.findById(req.user.id);
        const order = new Order({
            user: req.user.id, orderType: 'go', store: session.store, storeName: session.storeName,
            products: session.items, subtotal: session.subtotal, total: session.total,
            paymentMethod: req.body.paymentMethod || 'Cash at Store', trackingNumber,
            queueNumber: session.queueNumber, status: 'Pending',
            customerName: user.name, customerEmail: user.email, customerPhone: user.mobile,
            deliveryType: 'Store Pickup'
        });
        await order.save();
        session.status = 'completed';
        session.completedAt = new Date();
        await session.save();
        res.json({ success: true, order });
    } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ==================== HOME PAGE DATA ====================
app.get('/api/home', async (req, res) => {
    try {
        const featuredProducts = await Product.find({ featured: true, stock: { $gt: 0 } }).limit(8);
        const newArrivals = await Product.find({ stock: { $gt: 0 } }).sort('-createdAt').limit(8);
        const featuredBooks = await Book.find({ featured: true }).limit(8);
        const newBooks = await Book.find().sort('-createdAt').limit(8);
        const categories = await Category.find({ active: true }).sort('order');
        const settings = await Settings.findOne();
        res.json({
            success: true,
            data: { featuredProducts, newArrivals, featuredBooks, newBooks, categories, settings }
        });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ==================== SEARCH ====================
app.get('/api/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.length < 2) return res.status(400).json({ success: false, message: 'Query too short' });
        const regex = new RegExp(q, 'i');
        const products = await Product.find({ $or: [{ name: regex }, { description: regex }], stock: { $gt: 0 } }).limit(10);
        const books = await Book.find({ $or: [{ title: regex }, { author: regex }] }).limit(10);
        res.json({ success: true, results: { products, books } });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ==================== USER STATS ====================
app.get('/api/user/stats', authenticateToken, async (req, res) => {
    const user = await User.findById(req.user.id);
    const totalOrders = await Order.countDocuments({ user: req.user.id });
    const totalSpent = await Purchase.aggregate([{ $match: { user: user._id } }, { $group: { _id: null, total: { $sum: '$total' } } }]);
    res.json({
        success: true,
        totalOrders,
        totalSpent: totalSpent[0]?.total || 0,
        libraryCount: user.library.length,
        wishlistCount: user.wishlist.length,
        isPremium: user.isPremium,
        premiumExpiry: user.premiumExpiry
    });
});

// ==================== HEALTH CHECK ====================
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

app.get('/api', (req, res) => {
    res.json({ success: true, message: 'Arzona API is running!', version: '4.0.0' });
});

// ==================== ERROR HANDLERS ====================
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Route not found', path: req.originalUrl });
});

app.use((err, req, res, next) => {
    console.error('Error:', err.stack);
    res.status(500).json({ success: false, message: err.message });
});

// ==================== START SERVER ====================
async function connectDB() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/arzona');
        console.log('✅ MongoDB connected');
        await initializeDefaultSettings();
        await initializeDefaultAdmin();
        await initializeDefaultCategories();
    } catch (err) {
        console.error('MongoDB error:', err.message);
        setTimeout(connectDB, 5000);
    }
}

initModels();
connectDB().then(() => {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`\n🚀 Arzona Server running on port ${PORT}`);
        console.log(`📍 API: http://localhost:${PORT}/api`);
        console.log(`✅ Email: ${transporter ? 'CONFIGURED' : 'NOT CONFIGURED'}`);
        console.log(`✅ Ready for hosting on any domain/port\n`);
    });
});

module.exports = app;