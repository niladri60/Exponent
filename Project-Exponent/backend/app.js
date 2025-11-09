const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs-extra');
require('dotenv').config();

// Import routes
const gameRoutes = require('./routes/games');

// Import middleware
const errorHandler = require('./middleware/errorHandler');

const app = express();
app.timeout = 300000;

// Ensure required directories exist
async function ensureDirectories() {
    const directories = [
        'public/thumbnails',
        'public/games',
        'temp/uploads'
    ];
    
    for (const dir of directories) {
        await fs.ensureDir(dir);
    }
}

// Initialize directories
ensureDirectories().then(() => {
    console.log('Required directories initialized');
}).catch(console.error);

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'", 
                "'unsafe-eval'", 
                "'unsafe-inline'",  // Allow inline scripts for Unity
                "blob:",
                "cdnjs.cloudflare.com",
                "unpkg.com",
                "cdn.tailwindcss.com"
            ],
            styleSrc: [
                "'self'", 
                "'unsafe-inline'",   // Allow inline styles for Unity
                "fonts.googleapis.com"
            ],
            fontSrc: [
                "'self'", 
                "fonts.gstatic.com",
                "data:"              // Allow data URLs for fonts
            ],
            imgSrc: [
                "'self'", 
                "data:", 
                "blob:",
                "*"                  // Allow images from any source (Unity may load from various sources)
            ],
            connectSrc: [
                "'self'", 
                "blob:",
                "data:",
                "*"                  // Allow connections to any source for Unity WebGL
            ],
            mediaSrc: ["'self'"],
            objectSrc: ["'none'"],
            workerSrc: ["blob:"],    // Allow blob workers for Unity
            childSrc: ["blob:"]      // Allow blob child frames
        }
    },
    crossOriginEmbedderPolicy: false, // Disable for Unity WebGL compatibility
    crossOriginOpenerPolicy: false,   // Disable for Unity WebGL compatibility
    crossOriginResourcePolicy: { policy: "cross-origin" } // Allow cross-origin resources
}));

// Compression middleware
app.use(compression());

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: {
        success: false,
        message: 'Too many requests from this IP, please try again later.'
    }
});
app.use(limiter);

// CORS configuration
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Logging middleware
app.use(morgan('combined'));

// Body parsing middleware with increased limits for file uploads
app.use(express.json({ limit: process.env.MAX_FILE_SIZE || '500mb' }));
app.use(express.urlencoded({ 
    extended: true, 
    limit: process.env.MAX_FILE_SIZE || '500mb' 
}));

// Static files serving
app.use('/thumbnails', express.static(path.join(__dirname, 'public', 'thumbnails'), {
    maxAge: '1d',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.jpg') || filePath.endsWith('.png')) {
            res.set('Cache-Control', 'public, max-age=86400');
        }
    }
}));

app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '7d',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.set('Cache-Control', 'no-cache');
        } else {
            res.set('Cache-Control', 'public, max-age=604800');
        }
    }
}));

// Add specific MIME types for Unity WebGL files
app.use('/games', (req, res, next) => {
    // Set correct MIME types for Unity WebGL files
    if (req.path.endsWith('.wasm')) {
        res.set('Content-Type', 'application/wasm');
    } else if (req.path.endsWith('.data')) {
        res.set('Content-Type', 'application/octet-stream');
    } else if (req.path.endsWith('.js')) {
        res.set('Content-Type', 'application/javascript');
    }
    next();
}, express.static(path.join(__dirname, 'public', 'games'), {
    maxAge: '7d',
    setHeaders: (res, filePath) => {
        // No-cache for HTML files
        if (filePath.endsWith('.html')) {
            res.set('Cache-Control', 'no-cache');
        }
        // Long cache for assets
        else if (filePath.endsWith('.wasm') || filePath.endsWith('.js') || filePath.endsWith('.data')) {
            res.set('Cache-Control', 'public, max-age=31536000'); // 1 year
        }
    }
}));

// API Routes
app.use('/api/games', gameRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'Game Platform API',
        version: '1.0.0',
        endpoints: {
            games: '/api/games',
            health: '/health'
        }
    });
});

// Multer error handling middleware
app.use((error, req, res, next) => {
    if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
            success: false,
            message: 'File too large. Maximum size is 100MB for game files and 5MB for thumbnails.'
        });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({
            success: false,
            message: 'Too many files. Only thumbnail and game file are allowed.'
        });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({
            success: false,
            message: 'Unexpected field. Only "thumbnail" and "gameFile" fields are allowed.'
        });
    }
    
    if (error.message) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
    
    next(error);
});

// 404 handler - SIMPLIFIED - remove the problematic route pattern
app.use((req, res, next) => {
    if (req.path.startsWith('/api/') && req.path !== '/api/games') {
        return res.status(404).json({
            success: false,
            message: 'API endpoint not found'
        });
    }
    next();
});

// General 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

// Error handling middleware (should be last)
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`
🚀 Game Platform Server started!
📍 Port: ${PORT}
🌍 Environment: ${process.env.NODE_ENV || 'development'}
📊 Database: ${process.env.DB_NAME || 'game_platform'}
🔗 API: http://localhost:${PORT}/api
    `);
});

module.exports = app;