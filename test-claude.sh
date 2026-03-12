#!/usr/bin/env bash
set -euo pipefail

unset CLAUDECODE CLAUDE_CODE_SSE_PORT CLAUDE_CODE_ENTRYPOINT

FIFO=/tmp/test_fifo
rm -f "$FIFO"
mkfifo "$FIFO"

python3 -u -c "
import json
for line in open('$FIFO'):
    line = line.strip()
    if not line: continue
    try:
        d = json.loads(line)
        if d.get('type') == 'stream_event':
            evt = d.get('event',{})
            et = evt.get('type','')
            if et == 'content_block_delta':
                txt = evt.get('delta',{}).get('text','')
                if txt:
                    print(txt, end='', flush=True)
            elif et == 'content_block_start':
                tb = evt.get('content_block',{})
                if tb.get('type') == 'tool_use':
                    print(f'\n[tool: {tb.get(\"name\",\"\")}]', flush=True)
    except: pass
print()
" &
PARSER=$!

script -q /dev/null claude --dangerously-skip-permissions -p --verbose \
  --output-format stream-json --include-partial-messages \
  "write a 3 paragraph essay about cats" 2>/dev/null | tr -d '\r' > "$FIFO"

wait $PARSER 2>/dev/null
rm -f "$FIFO"
echo "=== done ==="
