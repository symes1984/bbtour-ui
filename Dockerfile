# ---- Build stage ----
FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ---- Runtime stage ----
FROM nginx:1.27-alpine

# Copy built assets from the build stage
COPY --from=build /app/dist /usr/share/nginx/html

# (Optional) Custom nginx config if you need SPA routing, etc.
# COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]