pnpm exec esbuild apibt.js \
  --bundle \
  --platform=node \
  --target=node20 \
  --external:serialport \
  --external:@serialport/bindings-cpp \
  --external:./settings.json \
  --outfile=apibt_bundle.js
