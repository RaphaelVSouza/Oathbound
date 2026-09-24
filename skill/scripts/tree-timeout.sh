#!/usr/bin/env bash
# Roda um comando com teto de tempo e, ao estourar, mata a ÁRVORE de processos
# inteira (taskkill /T no Windows), para não sobrar worker de node/vitest/
# playwright. Usado por quiet.sh, ds-run.sh e ds-queue.sh.
#
# Uso: tree-timeout.sh <segundos> -- comando args...
# Exit: o do comando; 124 se estourou o tempo.

set -uo pipefail
secs="${1:?uso: tree-timeout.sh <segundos> -- comando...}"; shift
[ "${1:-}" = "--" ] && shift
[ $# -gt 0 ] || { echo "uso: tree-timeout.sh <segundos> -- comando..." >&2; exit 2; }

kill_tree() {
  local pid="$1" winpid
  winpid="$(cat "/proc/$pid/winpid" 2>/dev/null || true)"
  if [ -n "$winpid" ] && command -v taskkill >/dev/null 2>&1; then
    taskkill //T //F //PID "$winpid" > /dev/null 2>&1
  else
    pkill -KILL -P "$pid" 2>/dev/null
    kill -KILL "$pid" 2>/dev/null
  fi
}

flag="$(mktemp -t tree-timeout-XXXXXX)"; rm -f "$flag"
"$@" &
pid=$!
reg=""  # registro para o ds-kill.sh quando sob ds-run.sh
if [ -n "${DSRUN_TAG:-}" ] && [ -n "${DSRUN_PROCS:-}" ]; then
  w="$(cat "/proc/$pid/winpid" 2>/dev/null || true)"
  [ -n "$w" ] && mkdir -p "$DSRUN_PROCS/$DSRUN_TAG" && reg="$DSRUN_PROCS/$DSRUN_TAG/$w" && printf %s "$*" | head -c 160 > "$reg"
fi
(
  sleep "$secs" &
  wait $!
  if kill -0 "$pid" 2>/dev/null; then
    : > "$flag"
    echo "── tree-timeout: ${secs}s estourados, matando árvore do pid $pid" >&2
    kill_tree "$pid"
  fi
) &
watchdog=$!
wait "$pid"; rc=$?
pkill -P "$watchdog" 2>/dev/null; kill "$watchdog" 2>/dev/null
[ -n "$reg" ] && rm -f "$reg"
if [ -f "$flag" ]; then rm -f "$flag"; exit 124; fi
exit $rc
