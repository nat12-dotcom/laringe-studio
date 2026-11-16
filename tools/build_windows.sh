#!/usr/bin/env bash
# Empaqueta la app para Windows con Electron.
# Uso: tools/build_windows.sh <ruta a electron-vX-win32-x64.zip verificado>
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ZIP="$1"
OUT="$ROOT/dist/LaringeStudio-Windows"
rm -rf "$OUT" "$ROOT/dist/LaringeStudio-Windows.zip"
mkdir -p "$OUT"
unzip -q "$ZIP" -d "$OUT"
mv "$OUT/electron.exe" "$OUT/Laringe Studio.exe"
rm -f "$OUT/resources/default_app.asar"
# solo los idiomas que hacen falta (reduce el tamaño)
find "$OUT/locales" -name '*.pak' ! -name 'es.pak' ! -name 'es-419.pak' ! -name 'en-US.pak' -delete
APP="$OUT/resources/app"
mkdir -p "$APP/js" "$APP/css" "$APP/icons"
cp "$ROOT/desktop/main.js" "$ROOT/desktop/package.json" "$APP/"
cp "$ROOT/index.html" "$APP/"
cp "$ROOT"/js/*.js "$APP/js/"
cp "$ROOT/css/style.css" "$APP/css/"
cp "$ROOT"/icons/*.png "$APP/icons/"
cat > "$OUT/LEEME.txt" <<'TXT'
Laringe Studio para Windows

1. Descomprime esta carpeta donde quieras (por ejemplo en Documentos).
2. Abre "Laringe Studio.exe".
3. Si Windows muestra "Windows protegió su PC", pulsa "Más información" y luego "Ejecutar de todas formas"
   (aparece porque la app no está firmada con un certificado de pago).
4. Cuando lo pida, permite el uso del micrófono.

Consejo: clic derecho en "Laringe Studio.exe" > Enviar a > Escritorio (crear acceso directo).
TXT
(cd "$ROOT/dist" && zip -qr -9 "LaringeStudio-Windows.zip" "LaringeStudio-Windows")
ls -la "$ROOT/dist"
