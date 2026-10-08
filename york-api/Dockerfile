# The live chat process does not run in this image.
# It runs on the captain's Mac, where the CLIs are already signed in.
# This image does not download a Cursor tarball, so there is no tarball checksum to pin.
# See scripts/install-mac.sh and ENV.md.
FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY data ./data

ENV NODE_ENV=production
ENV YORK_BIND_HOST=127.0.0.1
EXPOSE 8787
CMD ["npm", "start"]
