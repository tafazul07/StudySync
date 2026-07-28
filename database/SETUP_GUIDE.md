# Neon Database Setup Guide for StudySync

This guide will help you set up Neon PostgreSQL database and configure authentication for StudySync.

## Prerequisites

- A Neon account (free tier available at https://console.neon.tech/)
- Node.js installed on your machine

## Step 1: Create a Neon Database

1. Go to [https://console.neon.tech/](https://console.neon.tech/)
2. Sign up or log in to your account
3. Click "Create a project"
4. Choose a name for your project (e.g., "studysync")
5. Select a region closest to you
6. Click "Create project"
7. Wait for the database to be provisioned (usually takes 1-2 minutes)

## Step 2: Get Connection String

1. Once your project is created, you'll see a dashboard
2. Click on "Connection Details" or look for the connection string
3. Copy the connection string (it looks like: `postgresql://username:password@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require`)

## Step 3: Run Database Schema

1. Go to the Neon SQL Editor (click "SQL Editor" in the dashboard)
2. Copy the contents of `database/schema.sql`
3. Paste it into the SQL Editor
4. Click "Run" to execute the schema
5. You should see all tables created successfully

Alternatively, you can run the schema using psql:

```bash
psql "postgresql://username:password@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require" -f database/schema.sql
```

## Step 4: Configure Environment Variables

1. Open the `.env` file in the root directory
2. Replace the placeholder `DATABASE_URL` with your actual Neon connection string:

```env
DATABASE_URL=postgresql://your-actual-connection-string-here
```

3. Generate a secure JWT secret (you can use: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
4. Replace the `JWT_SECRET` with your generated secret:

```env
JWT_SECRET=your-generated-secret-here
```

## Step 5: Test the Connection

Start the backend server:

```bash
cd backend
npm run dev
```

If the connection is successful, you should see:
```
✅ Connected to Neon PostgreSQL
=================================
  StudySync Unified Server
=================================
API:        http://localhost:5000/api
Socket.io:  http://localhost:5000
Yjs WS:     ws://localhost:5000/yjs
=================================
```

## Step 6: Test Authentication

### Register a User

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "fullName": "Test User",
    "role": "student"
  }'
```

Response:
```json
{
  "user": {
    "id": "uuid-here",
    "email": "test@example.com",
    "fullName": "Test User",
    "role": "student",
    "isVerified": false
  },
  "accessToken": "jwt-token-here",
  "refreshToken": "refresh-token-here"
}
```

### Login

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

### Access Protected Route

```bash
curl -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Authentication Endpoints

### Public Endpoints
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/refresh` - Refresh access token

### Protected Endpoints (Require Authentication)
- `POST /api/auth/logout` - Logout user
- `POST /api/auth/logout-all` - Logout from all devices
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/profile` - Update user profile
- `POST /api/auth/change-password` - Change password

### Protected Resource Endpoints
All resource endpoints now require authentication:
- `GET/POST /api/study-plans` - Study plans
- `GET/POST/PATCH/DELETE /api/deadlines` - Deadlines
- `GET/POST/PATCH/DELETE /api/documents` - Documents
- `GET/POST /api/quizzes` - Quizzes
- `POST /api/quizzes/upload` - Upload quiz documents
- `POST /api/vaults/create` - Create vault
- `GET /api/vaults/list` - List vaults
- `POST /api/vaults/upload` - Upload file
- `POST /api/webrtc/rooms` - Create WebRTC room

## Using Authentication in Frontend

### Store Tokens

After login, store the tokens:

```javascript
localStorage.setItem('accessToken', response.accessToken);
localStorage.setItem('refreshToken', response.refreshToken);
```

### Make Authenticated Requests

```javascript
const accessToken = localStorage.getItem('accessToken');

fetch('http://localhost:5000/api/study-plans', {
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});
```

### Handle Token Refresh

```javascript
async function refreshToken() {
  const refreshToken = localStorage.getItem('refreshToken');
  const response = await fetch('http://localhost:5000/api/auth/refresh', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ refreshToken })
  });
  
  const data = await response.json();
  localStorage.setItem('accessToken', data.accessToken);
  return data.accessToken;
}
```

## Database Schema Overview

The following tables are created:

- **users** - User accounts and profiles
- **sessions** - User sessions for refresh tokens
- **study_plans** - Study plans linked to users
- **deadlines** - Deadlines linked to study plans and users
- **documents** - Collaboration documents
- **document_versions** - Document version history
- **document_updates** - Real-time document updates
- **comments** - Document comments
- **paragraph_permissions** - Fine-grained document permissions
- **quizzes** - Generated quizzes
- **quiz_attempts** - Quiz attempts and scores
- **vaults** - Encrypted file vaults
- **shared_files** - Shared files (vault and non-vault)
- **webrtc_rooms** - Video conference rooms
- **rag_documents** - Documents for RAG/quiz generation
- **document_chunks** - Text chunks for RAG

## Security Notes

1. **Never commit `.env` file** to version control
2. **Use strong JWT secrets** in production (at least 32 characters)
3. **Enable SSL** for database connections (Neon requires it by default)
4. **Use environment variables** for all sensitive data
5. **Implement rate limiting** (already configured in server.js)
6. **Use HTTPS** in production for all API calls

## Troubleshooting

### Connection Failed

- Verify your DATABASE_URL is correct
- Check that your Neon project is active
- Ensure SSL is enabled in the connection string

### Authentication Failed

- Verify JWT_SECRET is set in .env
- Check that tokens are being sent in the Authorization header
- Ensure tokens haven't expired (default: 7 days for access tokens)

### Schema Creation Failed

- Copy the entire schema.sql file
- Check for any syntax errors in the SQL
- Verify you have the necessary permissions in Neon

## Next Steps

1. Update your frontend to handle authentication
2. Implement login/register forms
3. Add token refresh logic
4. Update all API calls to include authentication headers
5. Test the complete authentication flow

## Support

For Neon-specific issues: https://neon.tech/docs
For StudySync issues: Check the project README
