FROM node:22-alpine
RUN apk add --no-cache ca-certificates curl tini \
 && addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY package*.json ./
# npm ci is used when a lockfile is supplied; otherwise npm install
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev --no-audit --no-fund; fi
COPY src ./src
COPY sql ./sql
RUN mkdir -p certs \
 && curl -fLsS --retry 3 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem -o certs/global-bundle.pem \
 && test -s certs/global-bundle.pem \
 && chown -R app:app /app
USER app
ENV NODE_ENV=production PORT=4000 DB_SSL_CA_FILE=/app/certs/global-bundle.pem
EXPOSE 4000
ENTRYPOINT ["/sbin/tini","--"]
CMD ["node","src/index.js"]
