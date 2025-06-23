FROM node:20-alpine

RUN apk add --no-cache curl unzip && \
    curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | tee /etc/apk/keys/ngrok.asc && \
    curl -O https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-stable-linux-amd64.zip && \
    unzip ngrok-stable-linux-amd64.zip -d /usr/local/bin && \
    rm ngrok-stable-linux-amd64.zip

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

CMD ["npm", "run", "server"]
