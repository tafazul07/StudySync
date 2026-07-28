const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const MAX_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 104857600; // 100MB

// Ensure upload dirs exist
const uploadDirs = {
    files: path.join(__dirname, '../../uploads/files'),
    vaults: path.join(__dirname, '../../uploads/vaults')
};

Object.values(uploadDirs).forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Generate random filename to prevent guessing
const generateFilename = (originalname) => {
    const random = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(originalname);
    return `${random}${ext}`;
};

const fileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDirs.files);
    },
    filename: (req, file, cb) => {
        cb(null, generateFilename(file.originalname));
    }
});

const vaultStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDirs.vaults);
    },
    filename: (req, file, cb) => {
        cb(null, generateFilename(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    // Block dangerous file types
    const blockedExts = ['.exe', '.bat', '.cmd', '.sh', '.msi', '.dll', '.scr'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (blockedExts.includes(ext)) {
        return cb(new Error('File type not allowed for security reasons'), false);
    }
    cb(null, true);
};

const uploadFile = multer({
    storage: fileStorage,
    limits: { fileSize: MAX_SIZE },
    fileFilter: fileFilter
});

const uploadVault = multer({
    storage: vaultStorage,
    limits: { fileSize: MAX_SIZE },
    fileFilter: fileFilter
});

module.exports = { uploadFile, uploadVault, uploadDirs };
