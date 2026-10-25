#!/usr/bin/env bash
# Mirrors templates/astro-starter to its public home,
# github.com/BackGoldHQ/backgold-starter, as the repository root. Run by the
# `sync-starter` workflow (.github/workflows/sync-starter.yml) on main; the
# public repository has no other writer.
#
#   scripts/sync-starter.sh                          sync and push
#   scripts/sync-starter.sh --dry-run                everything but the push
#   scripts/sync-starter.sh --dry-run --source-only  no key, no clone: build
#                                                    the tree and list it
#
# It always syncs main's NEWEST commit, whichever run it is in: it fetches
# the monorepo's `origin` main and takes the tree, the template's
# package.json and the short sha in the commit message from that commit, not
# from the job's own checkout. An older run's job therefore pushes the
# newest template or finds nothing to change; it can never revert the public
# repository, and two merges landing close together both end with the newest
# template synced. Until the template is on main, it stops with exit 1.
# `--dry-run --source-only`, the local test path, reads HEAD instead and
# says so.
#
# The tree is the template exactly as committed in that commit
# (`git archive`), so nothing untracked or ignored (node_modules, .dev.vars,
# build output) and nothing from outside the template can reach the public
# repository. Files deleted from the template are deleted there.
#
# In this workspace the template depends on `@backgold/astro` and
# `@backgold/content` as `workspace:^`, which only pnpm inside this repository
# can resolve. The public repository gets a package.json with each
# `workspace:` range on an `@backgold/*` dependency written as `^<version>`,
# the version in that package's packages/<dir>/package.json in the same source
# commit (read with `git show`, never from the working tree). Everything else
# in the file is as committed.
#
# Before anything is pushed, the `@backgold/astro` and `@backgold/content`
# ranges in that rewritten package.json must resolve on npm: the public
# repository is what Deploy to Cloudflare clones, so it must always install.
# A version bump in packages/ therefore reaches the public starter only once
# that version is published.
#
# The commit is pushed as a plain fast-forward on top of what was cloned. If
# the public repository's main moves between the clone and the push, the push
# is rejected and the job fails; re-run it and it starts from the new state.
#
# Exit codes: 0 synced, or nothing to sync; 3 a package range the starter
# names is not on npm yet (publish it, then re-run; the CI job reports this
# as a warning); 1 any other failure; 2 bad arguments.
#
# Authentication: STARTER_SYNC_KEY names a file holding the private half of
# the write deploy key on BackGoldHQ/backgold-starter (the workflow writes the
# repository secret of that name to a file it alone can read). github.com's
# host keys are pinned below; nothing is learned from the network at run
# time. The key is never printed.

set -euo pipefail

REMOTE="git@github.com:BackGoldHQ/backgold-starter.git"
BRANCH="main"
TEMPLATE_DIR="templates/astro-starter"
COMMIT_NAME="BackGold"
COMMIT_EMAIL="noreply@backgold.com"

# github.com's SSH host keys, as published at
# https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints
# and by `gh api meta --jq .ssh_keys` (checked 2026-10-24):
#   ED25519  SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU
#   ECDSA    SHA256:p2QAMXNIC1TJYWeIOttrVc98/R1BUFWu3/LiyKgUfQM
#   RSA      SHA256:uNiVztksCsDhcc0u9e8BujQXVUpKZIDTMczCvj3tD2s
# If GitHub rotates them, the push fails on host key verification; update
# these lines from that page, never from ssh-keyscan alone.
KNOWN_HOSTS='github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl
github.com ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBEmKSENjQEezOmxkZMy7opKgwFB9nkt5YRrYMjNuG5N87uRgg6CLrbo5wAdT/y6v0mKV0U2w0WZ2YB/++Tpockg=
github.com ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQCj7ndNxQowgcQnjshcLrqPEiiphnt+VTTvDP6mHBL9j1aNUkY4Ue1gvwnGLVlOhGeYrnZaMgRK6+PKCUXaDbC7qtbW8gIkhL7aGCsOr/C56SJMy/BCZfxd1nWzAOxSDPgVsmerOBYfNqltV9/hWCqBywINIR+5dIg6JTJ72pcEpEjcYgXkE2YEFXV1JHnsKgbLWNlhScqb2UmyRkQyytRLtL+38TGxkxCflmO+5Z8CSSNY7GidjMIZ7Q4zMjA2n1nGrlTDkzwDCsw+wqFPGQA179cnfGWOWRVruj16z6XyvxvjJwbz0wQZ75XK5tKSb7FNyeIEs4TT4jk+S4dhPeAUC5y+bDYirYgM4GC7uEnztnZyaVWQ7B381AK4Qdrwt51ZqExKbQpTUNn+EjqoTwvqNj4kqx5QUCI0ThS/YkOxJCXmPUWZbhjpCg56i+2aB6CmK2JGhn57K5mj0MNdBXA4/WnwH6XoPWJzK5Nyu2zB3nAZp+S5hpQs+p1vN1/wsjk='

DRY_RUN=0
SOURCE_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --source-only) SOURCE_ONLY=1 ;;
    *)
      echo "usage: $0 [--dry-run [--source-only]]" >&2
      exit 2
      ;;
  esac
done
if [ "$SOURCE_ONLY" = 1 ] && [ "$DRY_RUN" = 0 ]; then
  echo "--source-only needs --dry-run" >&2
  exit 2
fi

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

# --- The source commit: main's newest, whatever run this is in ------------
if [ "$SOURCE_ONLY" = 1 ]; then
  SOURCE_SHA=$(git rev-parse HEAD)
  echo "Source: HEAD (--source-only reads the local checkout, not main's newest commit)"
else
  # The job's checkout is shallow and detached, and `origin` is the CI
  # remote; fetching main's tip works there. --depth 1 only on a repository
  # that is already shallow, so a full local clone never becomes one.
  DEPTH_ARGS=()
  if [ "$(git rev-parse --is-shallow-repository)" = true ]; then
    DEPTH_ARGS=(--depth 1)
  fi
  if ! git fetch --quiet ${DEPTH_ARGS[@]+"${DEPTH_ARGS[@]}"} origin "refs/heads/$BRANCH"; then
    echo "FAIL: could not fetch the monorepo's origin $BRANCH; nothing synced." >&2
    exit 1
  fi
  # Resolve FETCH_HEAD to a sha at once: any later fetch would move it.
  SOURCE_SHA=$(git rev-parse FETCH_HEAD)
  echo "Source: origin $BRANCH's newest commit (this checkout is $(git rev-parse --short=9 HEAD))"
fi
SHORT_SHA=$(git rev-parse --short=9 "$SOURCE_SHA")

if ! git cat-file -e "$SOURCE_SHA:$TEMPLATE_DIR/package.json" 2>/dev/null; then
  if [ "$SOURCE_ONLY" = 1 ]; then
    echo "FAIL: $TEMPLATE_DIR/package.json is not committed at HEAD ($SHORT_SHA)." >&2
  else
    echo "FAIL: $TEMPLATE_DIR is not on $BRANCH yet (origin $BRANCH is $SHORT_SHA); nothing to sync until it merges." >&2
  fi
  exit 1
fi

WORK_ROOT=$(mktemp -d)
trap 'rm -rf "$WORK_ROOT"' EXIT

# --- The public package.json -------------------------------------------------
# Writes PUBLIC_MANIFEST: the template's package.json at the source commit with
# every `workspace:` range on an `@backgold/*` dependency replaced by
# `^<version>` of the workspace package of that name, whose version comes from
# packages/<dir>/package.json at the same commit. Prints each range it
# rewrites. Returns 1 when such a range names a package that is not under
# packages/ at that commit.
PUBLIC_MANIFEST="$WORK_ROOT/template-package.json"
write_public_manifest() {
  local versions="$WORK_ROOT/workspace-versions.txt" dir
  : > "$versions"
  for dir in $(git ls-tree -d --name-only "$SOURCE_SHA" packages/); do
    git cat-file -e "$SOURCE_SHA:$dir/package.json" 2>/dev/null || continue
    git show "$SOURCE_SHA:$dir/package.json" | node -e '
      let s = "";
      process.stdin.on("data", (d) => (s += d)).on("end", () => {
        const m = JSON.parse(s);
        process.stdout.write(m.name + " " + m.version + "\n");
      });
    ' >> "$versions"
  done
  git show "$SOURCE_SHA:$TEMPLATE_DIR/package.json" > "$WORK_ROOT/template-package.committed.json"
  node -e '
    const fs = require("fs");
    const [committed, versionsFile, out] = process.argv.slice(1);
    const m = JSON.parse(fs.readFileSync(committed, "utf8"));
    const versions = new Map(
      fs.readFileSync(versionsFile, "utf8").split("\n").filter(Boolean).map((line) => line.split(" ")),
    );
    let failed = false;
    for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
      for (const [name, range] of Object.entries(m[field] || {})) {
        if (!name.startsWith("@backgold/") || !String(range).startsWith("workspace:")) continue;
        const version = versions.get(name);
        if (!version) {
          console.log("  the starter depends on " + name + "@" + range + ", and no package under packages/ is named " + name);
          failed = true;
          continue;
        }
        m[field][name] = "^" + version;
        console.log("  " + name + ": " + range + " -> ^" + version);
      }
    }
    fs.writeFileSync(out, JSON.stringify(m, null, 2) + "\n");
    process.exit(failed ? 1 : 0);
  ' "$WORK_ROOT/template-package.committed.json" "$versions" "$PUBLIC_MANIFEST"
}

# --- The npm guard -----------------------------------------------------------
# Reads PUBLIC_MANIFEST, so it checks the ranges the public repository gets.
# Prints one line per package. Returns 0 when both ranges resolve on npm, 3
# when a range is a published-style range no npm version satisfies yet, and 1
# when a range is not an npm range at all (that is a template defect, not a
# wait for a publish, so it wins over 3).
check_npm_ranges() {
  local manifest="$PUBLIC_MANIFEST"
  local failed=0 name range resolved
  for name in @backgold/astro @backgold/content; do
    range=$(node -e '
      const m = require(process.argv[1]);
      const n = process.argv[2];
      const r = (m.dependencies || {})[n] ?? (m.devDependencies || {})[n] ?? "";
      process.stdout.write(String(r));
    ' "$manifest" "$name")
    if [ -z "$range" ]; then
      echo "  $name: not a dependency of the starter, nothing to check"
      continue
    fi
    case "$range" in
      workspace:* | file:* | link:* | portal:*)
        echo "  the starter depends on $name@$range, which npm cannot install; give it a published range"
        failed=1
        continue
        ;;
    esac
    # One line for a single match; `name@x.y.z 'x.y.z'` per line for several.
    # Nothing (or a 404 exit) when no published version satisfies the range.
    resolved=$(npm view "$name@$range" version 2>/dev/null | tail -n 1 | tr -d "'" || true)
    if [ -z "$resolved" ]; then
      echo "  the starter depends on $name@$range, which is not on npm yet; publish it first"
      [ "$failed" = 1 ] || failed=3
    else
      echo "  $name@$range resolves on npm (latest match: ${resolved##* })"
    fi
  done
  return "$failed"
}

# --- The tree ----------------------------------------------------------------
# Empties DEST (keeping .git) and fills it with the template as committed,
# its package.json replaced by PUBLIC_MANIFEST.
fill_tree() {
  local dest="$1"
  find "$dest" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
  git archive --format=tar "$SOURCE_SHA:$TEMPLATE_DIR" | tar -x -C "$dest"
  cp "$PUBLIC_MANIFEST" "$dest/package.json"
  if [ ! -f "$dest/LICENSE" ]; then
    write_license "$dest/LICENSE"
  fi
}

write_license() {
  cat > "$1" <<'LICENSE'
MIT License

Copyright (c) 2026 BackGold

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
LICENSE
}

echo "Starter sync from backgold@$SHORT_SHA ($TEMPLATE_DIR)"

echo "package.json for the public repository (workspace ranges as published ranges):"
if ! write_public_manifest; then
  echo "FAIL: the starter names an @backgold package this repository does not hold; not syncing." >&2
  exit 1
fi

# --- Source only: no key, no network to the repository -----------------------
if [ "$SOURCE_ONLY" = 1 ]; then
  echo "npm ranges (reported, not enforced, in --source-only):"
  check_npm_ranges || echo "  (a real sync would stop here)"
  TREE="$WORK_ROOT/tree"
  mkdir -p "$TREE"
  fill_tree "$TREE"
  echo "Tree that would be pushed to $REMOTE $BRANCH:"
  (cd "$TREE" && find . -type f | sed 's|^\./||' | LC_ALL=C sort)
  echo "dry run: nothing cloned, committed or pushed"
  exit 0
fi

echo "npm ranges:"
NPM_CHECK=0
check_npm_ranges || NPM_CHECK=$?
if [ "$NPM_CHECK" != 0 ]; then
  echo "FAIL: the public starter must always install; not syncing." >&2
  exit "$NPM_CHECK"
fi

# --- SSH ---------------------------------------------------------------------
KEY="${STARTER_SYNC_KEY:-}"
if [ -z "$KEY" ] || [ ! -f "$KEY" ] || [ ! -r "$KEY" ]; then
  echo "FAIL: STARTER_SYNC_KEY must name a readable file holding the deploy key's private half." >&2
  exit 1
fi
# A key pasted into a CI secret often arrives without its final newline
# or with CRLF line endings, and ssh then refuses it ("error in libcrypto").
# The script uses a private copy with LF endings and a trailing newline; the
# file it was given is left alone.
KEY_FILE="$WORK_ROOT/deploy_key"
(umask 077 && tr -d '\r' < "$KEY" > "$KEY_FILE" && printf '\n' >> "$KEY_FILE")
chmod 600 "$KEY_FILE"
if ! ssh-keygen -y -f "$KEY_FILE" > /dev/null 2>&1; then
  echo "FAIL: STARTER_SYNC_KEY is not a usable private key (it must be the whole unencrypted private key, from the BEGIN line to the END line)." >&2
  exit 1
fi
KEY="$KEY_FILE"
KNOWN_HOSTS_FILE="$WORK_ROOT/known_hosts"
printf '%s\n' "$KNOWN_HOSTS" > "$KNOWN_HOSTS_FILE"
# -F /dev/null: no ssh config file can add identities or loosen the checks.
# GlobalKnownHostsFile=/dev/null: the image's system known_hosts adds no
# trust; the pinned keys are the only ones accepted.
export GIT_SSH_COMMAND="ssh -F /dev/null -i '$KEY' -o IdentitiesOnly=yes -o BatchMode=yes -o UserKnownHostsFile='$KNOWN_HOSTS_FILE' -o GlobalKnownHostsFile=/dev/null -o StrictHostKeyChecking=yes"

# --- Clone (an empty repository has no main yet) ------------------------------
DEST="$WORK_ROOT/backgold-starter"
if ! REMOTE_REF=$(git ls-remote "$REMOTE" "refs/heads/$BRANCH"); then
  echo "FAIL: could not read $REMOTE with the deploy key (see the ssh error above)." >&2
  exit 1
fi
REMOTE_SHA=$(printf '%s' "$REMOTE_REF" | cut -f1)
if [ -n "$REMOTE_SHA" ]; then
  git clone --quiet --depth 1 --branch "$BRANCH" "$REMOTE" "$DEST"
else
  echo "$REMOTE has no $BRANCH yet; starting its history"
  git init --quiet "$DEST"
  git -C "$DEST" checkout --quiet -b "$BRANCH"
  git -C "$DEST" remote add origin "$REMOTE"
fi

fill_tree "$DEST"
git -C "$DEST" add -A
if git -C "$DEST" diff --cached --quiet; then
  echo "No change: $REMOTE $BRANCH already matches backgold@$SHORT_SHA."
  exit 0
fi
git -C "$DEST" diff --cached --stat | tail -n 1

GIT_AUTHOR_NAME="$COMMIT_NAME" GIT_AUTHOR_EMAIL="$COMMIT_EMAIL" \
GIT_COMMITTER_NAME="$COMMIT_NAME" GIT_COMMITTER_EMAIL="$COMMIT_EMAIL" \
  git -C "$DEST" -c commit.gpgsign=false commit --quiet -m "Sync from backgold@$SHORT_SHA"

if [ "$DRY_RUN" = 1 ]; then
  echo "dry run: committed $(git -C "$DEST" rev-parse --short HEAD) for $SOURCE_SHA, not pushed"
  exit 0
fi

if ! git -C "$DEST" push --quiet origin "HEAD:refs/heads/$BRANCH"; then
  echo "FAIL: $REMOTE rejected the push: its $BRANCH changed after it was cloned (it was at ${REMOTE_SHA:-nothing}). Re-run sync-starter; it starts from the new state." >&2
  exit 1
fi
echo "Pushed backgold@$SHORT_SHA to $REMOTE $BRANCH"
