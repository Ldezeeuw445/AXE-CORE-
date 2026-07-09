FROM node:20-alpine

WORKDIR /app

COPY AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/terminal-server.cjs ./terminal-server.cjs
COPY AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/infra/terminal/package.json ./package.json

RUN npm install --omit=dev

EXPOSE 4022

CMD ["npm", "start"]
