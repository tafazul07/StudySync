# SecureVault - File Sharing Platform

A secure file-sharing platform built with Node.js, Express, and PostgreSQL. Features public file sharing with expiring links and password-protected personal vaults.

## Features

- **File Sharing**: Upload files and get secure shareable links
- **Download Limits**: Set maximum number of downloads per link
- **Expiry Dates**: Set expiration time for share links
- **Personal Vaults**: Password-protected storage spaces
- **Vault Sharing**: Share entire vaults with a single link
- **Security**: Helmet headers, rate limiting, bcrypt passwords, random tokens
- **Modern UI**: Dark theme, drag & drop, responsive design

## Project Structure

```
fileshare-platform/
├── backend/
│   ├── server.js              # Express server entry point
│   ├── package.json             # Dependencies
│   ├── .env.example           # Environment variables template
│   ├── db/
│   │   ├── pool.js            # PostgreSQL connection pool
│   │   └── schema.sql         # Database schema (manual insert)
│   ├── middleware/
│   │   └── upload.js          # Multer file upload config
│   └── routes/
│       ├── files.js           # Public file sharing API
│       └── vaults.js          # Vault management API
├── frontend/
│   ├── index.html             # Single page application
│   ├── style.css              # Dark theme styles
│   └── app.js                 # Frontend logic
└── uploads/                   # File storage (auto-created)
    ├── files/                 # Shared files
    └── vaults/                # Vault files
```

## Setup Instructions

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your PostgreSQL credentials:

```bash
cp .env.example .env
```

Edit `.env`:
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=fileshare_db
DB_USER=postgres
DB_PASSWORD=your_password
PORT=3000
NODE_ENV=production
BCRYPT_SALT_ROUNDS=12
MAX_FILE_SIZE=104857600
```

### 3. Create PostgreSQL Database

Connect to PostgreSQL and run the schema:

```bash
psql -U postgres -d fileshare_db -f backend/db/schema.sql
```

Or manually execute the SQL in `backend/db/schema.sql`.

### 4. Start the Server

```bash
# Production
npm start

# Development (with auto-reload)
npm run dev
```

### 5. Access the Platform

Open your browser to `http://localhost:3000`

## API Endpoints

### File Sharing
- `POST /api/files/upload` - Upload a file (multipart/form-data)
- `GET /api/files/info/:token` - Get file metadata
- `GET /api/files/download/:token` - Download file
- `GET /api/files/list` - List all shared files
- `DELETE /api/files/:id` - Delete a shared file

### Vaults
- `POST /api/vaults/create` - Create a new vault
- `POST /api/vaults/verify/:token` - Unlock vault with password
- `POST /api/vaults/:token/upload` - Upload file to vault
- `GET /api/vaults/download/:fileToken` - Download vault file
- `DELETE /api/vaults/file/:fileToken` - Delete file from vault
- `DELETE /api/vaults/:token` - Delete entire vault
- `GET /api/vaults/list` - List all vaults

## Security Features

- **Helmet.js**: Security headers (CSP, HSTS, X-Frame-Options, etc.)
- **Rate Limiting**: 100 requests/15min general, 20 uploads/15min strict
- **bcrypt**: Password hashing with 12 salt rounds
- **Crypto tokens**: 48-character random hex tokens for all shares
- **File type filtering**: Blocks .exe, .bat, .cmd, .sh, .msi, .dll, .scr
- **Random filenames**: Original names never exposed in storage
- **Size limits**: 100MB max file size
- **Input validation**: Express-validator on all inputs

## License

MIT
