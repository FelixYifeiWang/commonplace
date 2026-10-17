#!/bin/zsh
set -e
cd "$(dirname "$0")"
if [[ ! -d node_modules ]]; then
  npm ci
fi
commonplace_server_pid=""
cleanup() {
  if [[ -n "$commonplace_server_pid" ]]; then kill "$commonplace_server_pid" 2>/dev/null || true; fi
}
trap cleanup EXIT INT TERM
if ! curl -fsS 'http://127.0.0.1:3100/' >/dev/null; then
  npm run local &
  commonplace_server_pid=$!
  for i in {1..45}; do
    if curl -fsS 'http://127.0.0.1:3100/' >/dev/null 2>&1; then break; fi
    sleep 1
  done
fi
open 'http://127.0.0.1:3100/'
npm run desktop
