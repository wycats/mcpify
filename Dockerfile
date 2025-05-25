FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json ./packages/core/
COPY packages/demo/package.json ./packages/demo/

# Install pnpm and dependencies
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN pnpm build

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S quickmcp -u 1001

# Change ownership of the app directory
RUN chown -R quickmcp:nodejs /app
USER quickmcp

# Expose port (will be overridden by Heroku's PORT env var)
EXPOSE 8080

# Set environment for 12-factor app compliance
ENV NODE_ENV=production

# Start the application using the environment configuration
CMD ["node", "--experimental-strip-types", "packages/core/src/main.ts", "--env"]