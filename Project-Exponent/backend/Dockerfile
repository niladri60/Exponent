FROM node:20-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
RUN mkdir -p uploads
EXPOSE 3000
CMD ["sh", "-c", "node scripts/setupDatabase.js && npm start"]