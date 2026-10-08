#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Verify a built HAP artifact: exists, non-empty, report size and SHA-256.
# Never reports success for a zero-byte or missing artifact.
set -euo pipefail

HAP="${1:?usage: build_artifact_check.sh <path-to.hap>}"

if [ ! -f "$HAP" ]; then
  echo "FAIL: HAP not found: $HAP" >&2
  exit 1
fi

SIZE="$(stat -c%s "$HAP" 2>/dev/null || stat -f%z "$HAP")"
if [ "$SIZE" -le 0 ]; then
  echo "FAIL: HAP is empty (0 bytes): $HAP" >&2
  exit 1
fi

SHA="$(sha256sum "$HAP" | awk '{print $1}')"
echo "HAP_OK path=$HAP size=$SIZE sha256=$SHA"
