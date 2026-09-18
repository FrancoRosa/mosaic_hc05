pnpm exec esbuild api.js \
  --bundle \
  --platform=node \
  --target=node20 \
  --external:serialport \
  --external:@serialport/bindings-cpp \
  --external:./settings.json \
  --outfile=api_bundle.js
