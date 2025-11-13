FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY . .
RUN mkdir -p \
    temp/uploads \
    public/thumbnails \
    public/games \
    && chown -R node:node /app \
    && chmod -R 755 /app
USER node
EXPOSE 3000
CMD ["sh", "-c", "node scripts/setupDatabase.js && npm start"]