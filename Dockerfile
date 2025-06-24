FROM node:20-bullseye


RUN apt-get update && \
    apt-get install -y curl unzip bash gnupg iputils-ping netcat && \
    curl -O https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-stable-linux-amd64.zip && \
    unzip ngrok-stable-linux-amd64.zip -d /usr/local/bin && \
    rm ngrok-stable-linux-amd64.zip && \
    ngrok config add-authtoken 2ytwG1VrjwaV0k9pAJAVm4hqLnF_4fF35zA5TgP4nsx6AwqFs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build


CMD ["npm", "run", "mail-worker"] 