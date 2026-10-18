FROM node:24-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts --package-lock=false && npm cache clean --force
COPY relay.mjs crypto.mjs ./
USER node
ENV PORT=28981 HOST=0.0.0.0
EXPOSE 28981
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:28981/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "relay.mjs"]
