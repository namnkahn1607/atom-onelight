#!/usr/bin/env bash
set -euo pipefail

npm i -D vscode-textmate vscode-oniguruma tsx typescript @types/node
npx tsx src/build.ts
