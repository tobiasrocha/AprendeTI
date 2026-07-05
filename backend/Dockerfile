FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js database.js ./
COPY middleware/ ./middleware/
COPY routes/ ./routes/
COPY utils/ ./utils/

RUN mkdir -p /data/uploads /data/db

EXPOSE 3001

ENV API_PORT=3001
ENV DB_PATH=/data/db/app.db
ENV UPLOAD_DIR=/data/uploads
CMD ["node", "server.js"]
