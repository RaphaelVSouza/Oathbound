#!/usr/bin/env bash
# Mata árvores de processo registradas pelas chamadas do ds-run.sh.
# Cada tree-timeout.sh rodando sob um ds-run (env DSRUN_TAG) grava o winpid do
# filho em <git-dir>/ds-queue/procs/<tag>/<winpid>; o registro some quando o
# filho termina. O que sobra é árvore viva de agente já encerrado (ex.: vitest
# que o opencode abandonou) e é morto com taskkill /T, sem esperar teto.
#
# Uso: ds-kill.sh [-d dir] [-q] (-l | <tag> | --orphans | --all)
#   -l         lista tags e processos registrados
#   <tag>      mata tudo da tag (o ds-run.sh chama isso no trap EXIT)
#   --orphans  mata tags cujo ds-run dono já morreu (varredura de início)
#   --all      mata tudo registrado
set -uo pipefail
dir=. quiet=0
while [ $# -gt 0 ]; do case $1 in -d) dir=$2; shift 2;; -q) quiet=1; shift;; *) break;; esac; done
what="${1:--l}"
pdir="$(git -C "$dir" rev-parse --absolute-git-dir)/ds-queue/procs"
[ -d "$pdir" ] || exit 0
say() { [ $quiet -eq 1 ] || echo "$@"; }
kill_tag() {
  local t="$1" f w
  for f in "$pdir/$t"/[0-9]*; do
    [ -e "$f" ] || continue; w="$(basename "$f")"
    if taskkill //T //F //PID "$w" > /dev/null 2>&1; then echo "── ds-kill: $t winpid=$w morto ($(head -c 80 "$f"))" >&2; fi
    rm -f "$f"
  done
  rm -f "$pdir/$t/.owner"; rmdir "$pdir/$t" 2>/dev/null
}
for td in "$pdir"/*/; do
  [ -d "$td" ] || continue; t="$(basename "$td")"; own="$(cat "$td/.owner" 2>/dev/null)"
  case "$what" in
    -l) say "$t dono=$own $([ -n "$own" ] && kill -0 "$own" 2>/dev/null && echo vivo || echo morto)"
        for f in "$td"[0-9]*; do [ -e "$f" ] && say "  winpid=$(basename "$f") $(head -c 100 "$f")"; done ;;
    --all) kill_tag "$t" ;;
    --orphans) { [ -z "$own" ] || ! kill -0 "$own" 2>/dev/null; } && kill_tag "$t" ;;
    *) [ "$t" = "$what" ] && kill_tag "$t" ;;
  esac
done
exit 0
