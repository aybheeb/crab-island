#!/bin/bash
# Crab Island POS launcher — opens the live app with silent printing.
# Edit PROD_URL below after your first Vercel deploy.
# On the restaurant Mac: double-click this file, or add it to Login Items.

PROD_URL="https://crab-island.vercel.app"   # ← update after vercel deploy

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

if [ ! -f "$CHROME" ]; then
  echo "❌  Google Chrome not found. Install it from https://www.google.com/chrome"
  exit 1
fi

pkill -x "Google Chrome" 2>/dev/null
sleep 1

"$CHROME" \
  --kiosk-printing \
  --app="$PROD_URL" \
  > /dev/null 2>&1 &

echo "✓  Crab Island POS launched → $PROD_URL"
