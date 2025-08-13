# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY src/ ./src/

# Build the application
RUN npm run build

# Runtime stage
FROM node:20-alpine AS runtime

# Add security updates and ca-certificates
RUN apk update && apk add --no-cache ca-certificates && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S bcce && \
    adduser -S bcce -u 1001 -G bcce

WORKDIR /app

# Copy built application
COPY --from=builder /app/dist/ ./dist/
COPY --from=builder /app/node_modules/ ./node_modules/
COPY --from=builder /app/package*.json ./

# Change ownership to non-root user
RUN chown -R bcce:bcce /app

# Switch to non-root user
USER bcce

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node dist/bcce.js --version || exit 1

# Set environment variables
ENV NODE_ENV=production
ENV BCCE_DOCKER=true

# Expose port (if needed for API mode)
EXPOSE 8080

# Default command
ENTRYPOINT ["node", "dist/bcce.js"]
CMD ["--help"]