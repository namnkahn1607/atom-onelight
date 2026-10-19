#!/usr/bin/env bash
set -euo pipefail

npx tsx src/build.ts
vsce package --skip-license
