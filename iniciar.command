#!/bin/bash
cd "$(dirname "$0")/server" || exit 1
if ! command -v node >/dev/null 2>&1; then echo "Falta Node.js: bajalo de https://nodejs.org"; read -r -p "Enter para cerrar"; exit 1; fi
node iniciar.js
