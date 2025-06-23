FROM node:20-alpine

RUN apk add --no-cache curl unzip && \
    curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | tee /etc/apk/keys/ngrok.asc && \
    curl -O https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-stable-linux-amd64.zip && \
    unzip ngrok-stable-linux-amd64.zip -d /usr/local/bin && \
    rm ngrok-stable-linux-amd64.zip

CMD ["ngrok config add-authtoken 2ytwG1VrjwaV0k9pAJAVm4hqLnF_4fF35zA5TgP4nsx6AwqFs"]

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

CMD ["npm", "run", "server"]
