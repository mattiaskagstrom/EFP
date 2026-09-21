#!/usr/bin/env bash
set -Eeuo pipefail

suite="${1:-Fast}"
compose_project="efp-test"
started=0
cleanup() {
  if [[ "$started" == "1" ]]; then docker compose -p "$compose_project" down -v; fi
}
trap cleanup EXIT

start_stack() {
  docker compose -p "$compose_project" up -d --build
  started=1
  for _ in {1..30}; do
    if curl --fail --silent http://localhost:8080/health >/dev/null; then return 0; fi
    sleep 2
  done
  echo "API startade inte inom 60 sekunder." >&2
  return 1
}

compare_openapi() {
  curl --fail --silent http://localhost:8080/openapi/v1.json -o "${TMPDIR:-/tmp}/efp-openapi.current.json"
  node scripts/compare-openapi.mjs tests/contracts/openapi.v1.json "${TMPDIR:-/tmp}/efp-openapi.current.json"
}

case "$suite" in
  ApiContract) dotnet test tests/Api.ContractTests/Api.ContractTests.csproj ;;
  Backend) dotnet test tests/Api.UnitTests/Api.UnitTests.csproj && dotnet test tests/Api.ContractTests/Api.ContractTests.csproj ;;
  Frontend) pnpm --filter efp-admin build && pnpm --filter efp-admin test ;;
  Fast) dotnet test tests/Api.UnitTests/Api.UnitTests.csproj && dotnet test tests/Api.ContractTests/Api.ContractTests.csproj && pnpm --filter efp-admin build && pnpm --filter efp-admin test && start_stack && compare_openapi && pnpm test:e2e:smoke && pnpm test:e2e:critical ;;
  Full) start_stack && pnpm exec playwright install chromium && pnpm test:e2e:full ;;
  *) echo "Usage: $0 {Fast|ApiContract|Backend|Frontend|Full}" >&2; exit 2 ;;
esac
