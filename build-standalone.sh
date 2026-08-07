#!/usr/bin/env bash
# Regenerates the standalone single-file HTML from index.html/style.css/data.js/app.js.
set -euo pipefail
cd "$(dirname "$0")"

OUT="${1:-sun-earth-office-map.standalone.html}"

python3 - "$OUT" <<'PY'
import sys

out_path = sys.argv[1]

with open("index.html", encoding="utf-8") as f:
    html = f.read()
with open("style.css", encoding="utf-8") as f:
    css = f.read()
with open("data.js", encoding="utf-8") as f:
    data_js = f.read()
with open("app.js", encoding="utf-8") as f:
    app_js = f.read()

html = html.replace(
    '<link rel="stylesheet" href="style.css" />',
    f"<style>\n{css}</style>",
)
html = html.replace(
    '  <script src="data.js"></script>\n  <script src="app.js"></script>',
    f"  <script>\n{data_js}\n{app_js}  </script>",
)

with open(out_path, "w", encoding="utf-8") as f:
    f.write(html)

print(f"wrote {out_path}")
PY
