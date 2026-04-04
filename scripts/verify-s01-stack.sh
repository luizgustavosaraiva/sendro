#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

assert_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "missing_dependency:$cmd" >&2
    exit 1
  fi
}

assert_cmd pnpm
assert_cmd bash

if ! command -v docker >/dev/null 2>&1; then
  echo "docker_unavailable" >&2
  exit 1
fi

cleanup() {
  if [[ -n "${DASHBOARD_PID:-}" ]]; then kill "$DASHBOARD_PID" >/dev/null 2>&1 || true; fi
  if [[ -n "${API_PID:-}" ]]; then kill "$API_PID" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT

if ! docker info >/dev/null 2>&1; then
  echo "docker_daemon_unavailable" >&2
  exit 1
fi

docker compose up -d postgres >/dev/null

for _ in {1..30}; do
  if docker compose exec -T postgres pg_isready -U sendro -d sendro >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

pnpm --filter @repo/db db:migrate >/dev/null

pnpm --filter api start > /tmp/sendro-api.log 2>&1 &
API_PID=$!
pnpm --filter dashboard start > /tmp/sendro-dashboard.log 2>&1 &
DASHBOARD_PID=$!

for _ in {1..30}; do
  if curl -fsS http://127.0.0.1:3001/health >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

for _ in {1..30}; do
  if curl -fsS http://127.0.0.1:3000/login >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

VERIFY_OUTPUT="$(pnpm tsx scripts/verify-auth-flow.ts)"
printf '%s\n' "$VERIFY_OUTPUT"

ROLE_OUTPUT="$(node <<'NODE'
const email = `company.${Date.now()}@sendro.test`;
const params = new URLSearchParams({
  name: 'Company Visual',
  email,
  password: 'secret123',
  role: 'company',
  companyName: 'Company Visual'
});
const register = await fetch('http://127.0.0.1:3000/register', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: params,
  redirect: 'manual'
});
const cookie = register.headers.get('set-cookie') ?? '';
if (register.status !== 302 || !cookie) {
  console.error(`dashboard_register_failed:${register.status}`);
  process.exit(1);
}
const dashboard = await fetch('http://127.0.0.1:3000/dashboard', {
  headers: { cookie }
});
const html = await dashboard.text();
if (!dashboard.ok) {
  console.error(`dashboard_fetch_failed:${dashboard.status}:${html}`);
  process.exit(1);
}
if (!html.includes('Company Visual') || !html.includes('company')) {
  console.error('dashboard_ssr_proof_missing');
  process.exit(1);
}
console.log('dashboard_ssr_verified');
NODE
)"
printf '%s\n' "$ROLE_OUTPUT"
