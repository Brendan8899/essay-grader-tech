FROM --platform=linux/amd64 node:20

RUN apt-get update -y && \
    apt-get install -y graphicsmagick && \
    apt-get install -y ghostscript && \
    apt-get install -y libasound2 && \
    apt-get install -y libgconf-2-4 && \
    apt-get install -y libatk1.0-0 && \
    apt-get install -y libatk-bridge2.0-0 && \
    apt-get install -y libgdk-pixbuf2.0-0 && \
    apt-get install -y libgtk-3-0 && \
    apt-get install -y libgbm-dev && \
    apt-get install -y libnss3-dev && \
    apt-get install -y libxss-dev

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true

RUN apt-get update && apt-get install curl gnupg -y \
    && curl --location --silent https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install google-chrome-stable -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*
    
WORKDIR /app

COPY package*.json ./

RUN npm install

RUN npm uninstall sharp
RUN npm install --os=linux --cpu=x64 sharp


COPY . .

CMD ["npm", "run", "dev"]
