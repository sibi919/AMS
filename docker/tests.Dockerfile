FROM joab-academy-frontend-dev:latest
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends chromium && rm -rf /var/lib/apt/lists/*
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
COPY . .
CMD ["npm", "run", "test:browser", "--", "--workers=1"]
