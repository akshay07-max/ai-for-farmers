# KrishiMitra AI - Backend

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Setup environment
```bash
# Edit .env with your values
```

### 3. Start development server
```bash
npm run dev
```

Server starts at: http://localhost:5000

### 4. Test API
```bash
# Health check
curl http://localhost:5000/health

# Register a farmer
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Ashu Patil","phone":"9876543210","password":"Test@1234","role":"FARMER","languagePreference":"mr"}'
```

## API Endpoints (Step 1)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/v1/auth/register | Register new user |
| POST | /api/v1/auth/verify-otp | Verify phone OTP |
| POST | /api/v1/auth/login | Login |
| POST | /api/v1/auth/refresh | Refresh access token |
| POST | /api/v1/auth/logout | Logout |
| POST | /api/v1/auth/forgot-password | Send reset OTP |
| POST | /api/v1/auth/reset-password | Reset password |
| GET  | /api/v1/users/me | Get my profile |
| PUT  | /api/v1/users/me | Update my profile |
| GET  | /health | Health check |

## Run Tests
```bash
npm test
```
