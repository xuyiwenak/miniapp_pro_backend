#!/usr/bin/env bash
# release.sh — merge master → release and push both branches
#
# Usage:
#   ./scripts/release.sh              # interactive: asks for confirmation
#   ./scripts/release.sh --yes        # non-interactive: skip confirmation prompt
#
# What it does:
#   1. Ensures working tree is clean (no uncommitted changes)
#   2. Pulls latest master from origin
#   3. Switches to release branch (creates it if not present locally)
#   4. Merges master into release (fast-forward preferred, merge commit if needed)
#   5. Pushes release to origin
#   6. Switches back to master
#
# Requires: git, remote "origin" configured with push access

set -euo pipefail

MASTER="master"
RELEASE="release"
YES=false

for arg in "$@"; do
  [[ "$arg" == "--yes" ]] && YES=true
done

# ── helpers ──────────────────────────────────────────────────────────────────
info()    { printf '\033[0;36m[release] %s\033[0m\n' "$*"; }
success() { printf '\033[0;32m[release] %s\033[0m\n' "$*"; }
err()     { printf '\033[0;31m[release] ERROR: %s\033[0m\n' "$*" >&2; exit 1; }

# ── pre-flight ────────────────────────────────────────────────────────────────
GIT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || err "not inside a git repository"
cd "$GIT_ROOT"

if ! git diff --quiet || ! git diff --cached --quiet; then
  err "working tree has uncommitted changes — commit or stash first"
fi

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

# ── show what will happen ─────────────────────────────────────────────────────
info "Current branch : $CURRENT_BRANCH"
info "Will merge     : $MASTER → $RELEASE"
info "Will push      : origin/$RELEASE"

if [[ "$YES" != "true" ]]; then
  printf '\033[0;33m[release] Proceed? [y/N] \033[0m'
  read -r answer
  [[ "$answer" =~ ^[Yy]$ ]] || { info "Aborted."; exit 0; }
fi

# ── step 1: update master ─────────────────────────────────────────────────────
info "Fetching origin..."
git fetch origin

info "Checking out $MASTER and pulling..."
git checkout "$MASTER"
git pull origin "$MASTER"

# ── step 2: update / create release branch ───────────────────────────────────
if git show-ref --verify --quiet "refs/heads/$RELEASE"; then
  info "Checking out existing branch $RELEASE..."
  git checkout "$RELEASE"
  # Only pull if origin/release exists; require fast-forward to avoid silent conflict swallowing
  if git ls-remote --exit-code origin "$RELEASE" &>/dev/null; then
    git fetch origin "$RELEASE"
    LOCAL=$(git rev-parse "$RELEASE")
    REMOTE=$(git rev-parse "origin/$RELEASE")
    BASE=$(git merge-base "$RELEASE" "origin/$RELEASE")
    if [[ "$LOCAL" == "$REMOTE" ]]; then
      info "$RELEASE is already up to date with origin/$RELEASE"
    elif [[ "$BASE" == "$LOCAL" ]]; then
      info "Fast-forwarding $RELEASE to origin/$RELEASE..."
      git merge --ff-only "origin/$RELEASE"
    elif [[ "$BASE" == "$REMOTE" ]]; then
      info "Local $RELEASE is ahead of origin/$RELEASE, no pull needed"
    else
      err "$RELEASE has diverged from origin/$RELEASE — please resolve manually before releasing"
    fi
  fi
else
  info "Creating local branch $RELEASE from origin/$MASTER..."
  git checkout -b "$RELEASE"
fi

# ── step 3: merge ─────────────────────────────────────────────────────────────
info "Merging $MASTER into $RELEASE..."
MASTER_SHA=$(git rev-parse --short "$MASTER")
git merge "$MASTER" --no-edit -m "chore(release): merge $MASTER ($MASTER_SHA) into $RELEASE"

# ── step 4: push ──────────────────────────────────────────────────────────────
info "Pushing $RELEASE to origin..."
git push origin "$RELEASE"

# ── step 5: return to original branch ────────────────────────────────────────
git checkout "$CURRENT_BRANCH"

success "Done! origin/$RELEASE is now up to date with $MASTER ($MASTER_SHA)."
