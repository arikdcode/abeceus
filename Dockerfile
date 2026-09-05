FROM node:22-slim

WORKDIR /quartz

# Clone Quartz and install dependencies.
# Pin to a specific tag: Quartz v5 restructured the build (generated
# .quartz/plugins) and is incompatible with our v4-format quartz.config.ts /
# quartz.layout.ts. Bump this deliberately alongside a config/layout migration.
ARG QUARTZ_VERSION=v4.5.2
RUN apt-get update && apt-get install -y git && \
    git clone --branch ${QUARTZ_VERSION} --depth 1 https://github.com/jackyzha0/quartz.git . && \
    npm ci && \
    apt-get remove -y git && apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

# The wiki content will be mounted at /quartz/content
VOLUME /quartz/content

EXPOSE 5050

# Default to dev server with hot-reload
CMD ["npx", "quartz", "build", "--serve", "--port", "5050"]
