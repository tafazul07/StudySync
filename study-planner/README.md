# Study Planner + Deadline Tracker

## Quick Start

### 1. Database Setup
```bash
psql -U postgres
CREATE DATABASE study_planner;
\q
psql -U postgres -d study_planner -f database/schema.sql
```

### 2. Backend Setup
```bash
cd backend
npm install
# Edit .env with your credentials
npm run dev
```

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

## Required API Keys
- **OpenRouter**: https://openrouter.ai/keys
- **Twilio**: https://console.twilio.com/ (for SMS)
- **Gmail**: Enable 2FA -> App Password for SMTP

## Production Deployment

### Backend (PM2)
```bash
npm install -g pm2
cd backend
pm2 start server.js --name study-planner-api
```

### Frontend Build
```bash
cd frontend
npm run build
# Serve dist/ folder via Nginx or any static host
```

## Features
- PDF/DOCX/TXT/MD file upload and text extraction
- AI-powered study plan generation via OpenRouter
- Automatic deadline creation from milestones
- Email reminders via Nodemailer (24h before due)
- SMS reminders via Twilio (24h before due)
- Cron job runs every 15 minutes
- React dashboard with plan viewer
- Deadline tracking with completion status
