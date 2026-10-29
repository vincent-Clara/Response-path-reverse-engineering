#!/bin/sh
# macOS / Linux: start a local server and open the app
cd "$(dirname "$0")"
PORT=8787
( sleep 1; (command -v open >/dev/null && open "http://localhost:$PORT/") || xdg-open "http://localhost:$PORT/" ) &
python3 -m http.server $PORT --bind 127.0.0.1
