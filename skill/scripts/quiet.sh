#!/usr/bin/env bash
# Roda um comando guardando o log completo em arquivo e devolvendo ao contexto
# do agente só o essencial: 5 linhas no sucesso; na falha, um trecho filtrado
# por padrões de erro (limitado) + caminho do log para leitura dirigida (grep).
#
# Uso: quiet.sh [-l arquivo.log] [-n 60] [-p 'regex extra'] [-t 600] -- comando args...
# -t: teto em segundos (padrão 600); estourado, mata a árvore de processos.
# Exit: o mesmo do comando; 124 em timeout.

set -uo pipefail
tt="$(cd "$(dirname "$0")" && pwd)/tree-timeout.sh"

log="" max=60 extra="" tmo=600
while getopts "l:n:p:t:" opt; do
  case "$opt" in
    l) log="$OPTARG" ;;
    n) max="$OPTARG" ;;
    p) extra="$OPTARG" ;;
    t) tmo="$OPTARG" ;;
    *) echo "opção inválida" >&2; exit 2 ;;
  esac
done
shift $((OPTIND - 1))
[ "${1:-}" = "--" ] && shift
[ $# -gt 0 ] || { echo "Uso: quiet.sh [-l log] [-n linhas] [-p regex] -- comando..." >&2; exit 2; }

[ -n "$log" ] || log="$(mktemp -t quiet-XXXXXX.log)"
mkdir -p "$(dirname "$log")"

started=$(date +%s)
bash "$tt" "$tmo" -- "$@" > "$log" 2>&1
rc=$?
elapsed=$(( $(date +%s) - started ))
total=$(wc -l < "$log")

if [ $rc -eq 0 ]; then
  grep -v '^[[:space:]]*$' "$log" | tail -n 5
  echo "── ok exit=0 ${elapsed}s linhas=$total log=$log"
  exit 0
fi

# Padrões comuns de falha em test runners, compiladores e linters.
pat='(^|[^a-z])(fail(ed|ure)?|error|exception|assert|expected|received|timeout|timed out|panic|traceback|✘|✖|×)([^a-z]|$)'
[ -n "$extra" ] && pat="$pat|$extra"

echo "── FALHA exit=$rc ${elapsed}s linhas=$total log=$log"
echo "── trecho (máx $max linhas; aprofunde com grep -n no log):"
grep -n -i -E -A3 "$pat" "$log" | grep -v '^--$' | head -n "$max"
echo "── últimas 10 linhas:"
tail -n 10 "$log"
exit $rc
