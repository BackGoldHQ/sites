#!/usr/bin/env bash
# Deploys templates/<template> as the Worker `template-<template>` in a
# Workers for Platforms dispatch namespace: `sites-staging` for staging,
# `sites-production` for production. Run by the deploy jobs in
# .github/workflows/deploy-staging.yml and release.yml:
#
#   scripts/deploy-template.sh staging party
#   scripts/deploy-template.sh production party
#
# The api Worker of that environment (givegold-api-staging answers every
# *.backgold.dev host; backgold-api every *.backgold.com host and each
# verified tenant custom domain) dispatches each request for a site on the
# template to this Worker with the site's id in X-BackGold-Site; the Worker
# reads the Content API first-party, through a service binding to the api's
# FirstParty entrypoint. One deploy serves every site on the template. A
# namespace Worker has no routes or Custom Domain, so the deploy touches no
# DNS. Content changes never need it: a publish bumps the site's content
# version, the client notices within its one-minute version check, and a new
# version is a miss in the site's cache.
#
# It builds from this workspace: the job installs it, the two packages build
# to their dist, and the template's @backgold dependencies resolve to them,
# so the deploy carries the packages as committed here, never what is on npm.
#
# The environment of templates/<template>/wrangler.jsonc holds the name, the
# BACKGOLD_API service binding, BACKGOLD_API_ORIGIN and the cache's KV
# binding. The Cloudflare adapter writes the deploy config
# (dist/server/wrangler.json) during `astro build`, choosing the environment
# from CLOUDFLARE_ENV then; `wrangler deploy` reads that file, so a `--env`
# given only at deploy time would be ignored and the default config (Worker
# `backgold-<template>`) deployed. The script therefore builds with
# CLOUDFLARE_ENV set and refuses to deploy unless the built config names
# template-<template>. Before building it reads the namespace and stops with
# a sentence when it does not exist (wrangler's code 100119): creating it is
# a one-time account step (templates/<template>/README.md, Staging deploy or
# Production deploy).
#
# wrangler reads CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID from the
# environment. The KV namespace id comes from <TEMPLATE>_<ENV>_KV_ID
# (PARTY_STAGING_KV_ID, PETITION_DRIVE_PRODUCTION_KV_ID, ...), a repository
# secret the job passes through as an environment variable: the id of the
# BACKGOLD_CACHE KV namespace, created once by hand. Wrangler reads no
# environment variable in a config, so the script writes it over the
# __<TEMPLATE>_<ENV>_KV_ID__ placeholder in wrangler.jsonc before the build.
# No site key and no secrets: a first-party read needs no key (the site comes
# from X-BackGold-Site, drafts for /preview included), and the api keeps
# /api/* on every site host, so the template's webhook route is never reached.

set -euo pipefail

ENVIRONMENT="${1:-}"
TEMPLATE="${2:-}"
case "$ENVIRONMENT" in
  staging) namespace=sites-staging ;;
  production) namespace=sites-production ;;
  *)
    echo "usage: $0 <staging|production> <template>" >&2
    exit 2
    ;;
esac
if [ -z "$TEMPLATE" ] || [ ! -f "templates/$TEMPLATE/wrangler.jsonc" ]; then
  echo "usage: $0 <staging|production> <template>  (templates/<template>/wrangler.jsonc must exist)" >&2
  exit 2
fi

for var in CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID; do
  if [ -z "${!var:-}" ]; then
    echo "FAIL: $var is not set; it is a repository secret the deploy job passes through. Not deploying." >&2
    exit 1
  fi
done

# party → PARTY, petition-drive → PETITION_DRIVE.
KV_VAR="$(printf '%s' "$TEMPLATE" | tr '[:lower:]-' '[:upper:]_')_$(printf '%s' "$ENVIRONMENT" | tr '[:lower:]' '[:upper:]')_KV_ID"
kv_id="${!KV_VAR:-}"
if ! printf '%s' "$kv_id" | grep -Eq '^[0-9a-f]{32}$'; then
  echo "FAIL: $KV_VAR must be the BACKGOLD_CACHE namespace's 32-character id. Create the namespace once (templates/$TEMPLATE/README.md) and set the repository secret." >&2
  exit 1
fi
sed -i "s/__${KV_VAR}__/$kv_id/" "templates/$TEMPLATE/wrangler.jsonc"
if ! grep -q "\"id\": \"$kv_id\"" "templates/$TEMPLATE/wrangler.jsonc"; then
  echo "FAIL: templates/$TEMPLATE/wrangler.jsonc has no __${KV_VAR}__ placeholder in its $ENVIRONMENT kv_namespaces; not deploying." >&2
  exit 1
fi

if ! ns_out=$(pnpm --filter "backgold-template-$TEMPLATE" exec wrangler dispatch-namespace get "$namespace" 2>&1); then
  if printf '%s' "$ns_out" | grep -q 'code: 100119'; then
    echo "FAIL: the dispatch namespace $namespace does not exist on this account. Create it once (templates/$TEMPLATE/README.md), then run the job again." >&2
  else
    printf '%s\n' "$ns_out" >&2
    echo "FAIL: could not read the dispatch namespace $namespace (wrangler's error above); not deploying." >&2
  fi
  exit 1
fi

pnpm --filter @backgold/content build
pnpm --filter @backgold/astro build
CLOUDFLARE_ENV="$ENVIRONMENT" pnpm --filter "backgold-template-$TEMPLATE" build
built=$(node -p "require('./templates/$TEMPLATE/dist/server/wrangler.json').name")
if [ "$built" != "template-$TEMPLATE" ]; then
  echo "FAIL: the build wrote a deploy config for '$built', not template-$TEMPLATE; not deploying." >&2
  exit 1
fi
pnpm --filter "backgold-template-$TEMPLATE" exec wrangler deploy --dispatch-namespace "$namespace"
