# ✅ Basis-Image mit Playwright + Chromium
FROM mcr.microsoft.com/playwright:v1.51.1-jammy

# Setze Arbeitsverzeichnis
WORKDIR /app

# Kopiere die package.json und package-lock.json
COPY package*.json ./

# Installiere nur benötigte Pakete (Express & Playwright ist vorinstalliert im Base-Image)
RUN npm install

# Kopiere restlichen Code
COPY . .

# Exponiere Port 3000 (für Cloud Run)
EXPOSE 3000

# Startbefehl
CMD ["node", "index.js"]