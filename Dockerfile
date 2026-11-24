FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY public ./public
RUN npm ci
COPY . .
RUN DATABASE_PATH=/tmp/build.db npm run build
ENV NODE_ENV=production DATABASE_PATH=/app/data/db/floodwise.db PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
