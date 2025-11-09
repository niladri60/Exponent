const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');

// Create temp directory if it doesn't exist
const tempDir = path.join(__dirname, '..', 'temp', 'uploads');
fs.ensureDirSync(tempDir);

// Use disk storage instead of memory storage for large files
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, tempDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// File filter function
const fileFilter = (req, file, cb) => {
    try {
        if (file.fieldname === 'thumbnail') {
            if (file.mimetype.startsWith('image/')) {
                cb(null, true);
            } else {
                cb(new Error('Only image files are allowed for thumbnails'), false);
            }
        } else if (file.fieldname === 'gameFile') {
            const isZip = file.mimetype === 'application/zip' || 
                         file.mimetype === 'application/x-zip-compressed' ||
                         file.originalname.toLowerCase().endsWith('.zip');
            
            if (isZip) {
                cb(null, true);
            } else {
                cb(new Error('Only ZIP files are allowed for game uploads'), false);
            }
        } else {
            cb(new Error(`Unexpected field: ${file.fieldname}`), false);
        }
    } catch (error) {
        cb(error, false);
    }
};

// Configure multer with disk storage
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 500 * 1024 * 1024, // 500MB
        files: 2
    }
});

module.exports = upload;