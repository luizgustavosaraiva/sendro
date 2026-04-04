#!/usr/bin/env bash
set -euo pipefail

printf '\n[verify-s01] Checking monorepo scaffold...\n'

required_files=(
  "package.json"
  "pnpm-workspace.yaml"
  "turbo.json"
  "tsconfig.base.json"
  "docker-compose.yml"
  "README.md"
  "packages/shared/src/types/auth.ts"
  "packages/shared/src/schemas/auth.ts"
  "packages/shared/src/index.ts"
  "packages/db/src/index.ts"
  "apps/api/src/index.ts"
  "apps/dashboard/src/app/page.tsx"
  "tests/smoke/workspace.test.ts"
)

for file in "${required_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "[verify-s01] missing: $file" >&2
    exit 1
  fi
  echo "[verify-s01] ok file: $file"
done

grep -q 'entityRoles = \["company", "retailer", "driver"\]' packages/shared/src/types/auth.ts
printf '[verify-s01] shared roles contract found\n'

grep -q 'export const registerSchemaByRole' packages/shared/src/schemas/auth.ts
printf '[verify-s01] shared register schema map found\n'

printf '[verify-s01] done\n'
