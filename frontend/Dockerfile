FROM node:20-slim

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json ./
RUN npm install

# Copy the rest of the source.
COPY . .

EXPOSE 5173

# Vite dev server with hot-reload. Source is bind-mounted via compose.
CMD ["npm", "run", "dev"]
