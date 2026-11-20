FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3000
# Применяем схему БД и запускаем приложение (бот работает через webhook внутри Next.js)
CMD ["sh", "-c", "npx drizzle-kit push --force && npm run start"]
