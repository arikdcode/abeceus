FROM node:22-slim

WORKDIR /quartz

# Clone Quartz and install dependencies
RUN apt-get update && apt-get install -y git && \
    git clone --depth 1 https://github.com/jackyzha0/quartz.git . && \
    npm ci && \
    apt-get remove -y git && apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

# The wiki content will be mounted at /quartz/content
VOLUME /quartz/content

EXPOSE 8080

# Default to dev server with hot-reload
CMD ["npx", "quartz", "build", "--serve", "--port", "8080"]
