#!/usr/bin/env bash
# Adversarial suite. Local suites need no network; UI needs the chromium in /workspace/tools/chromium; live hits sparkling-dev (~300 requests).
set -u
cd "$(dirname "$0")/../.."
L="--no-warnings --import ./tests/adversarial/html-loader.mjs"
for s in recognition api qloo plan i18n; do node $L tests/adversarial/$s.test.mjs 2>/dev/null | grep -a "pass ("; done
VP=mobile node $L tests/adversarial/ui.test.mjs 2>/dev/null | grep -a "pass ("
VP=desktop node $L tests/adversarial/ui.test.mjs 2>/dev/null | grep -a "pass ("
[ "${LIVE:-0}" = "1" ] && python3 tests/adversarial/live.py "${LABEL:-run}"
