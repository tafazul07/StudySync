# Multi-stage build for Node.js backend
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy dependencies from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/loadEnv.js ./
COPY --from=builder /app/services ./services
COPY --from=builder /app/middleware ./middleware
COPY --from=builder /app/routes ./routes
COPY --from=builder /app/server.js ./

# Create uploads directory
RUN mkdir -p uploads/vaults uploads/documents uploads/quizzes

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/api/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start server
CMD ["node", "server.js"]
