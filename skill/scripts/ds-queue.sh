#!/usr/bin/env bash
# Fila de issues: para cada issue, ds-runner implementa (via ds-run.sh) e
# ds-reviewer revisa o diff. Runner e reviewer reaproveitam a própria sessão
# ao longo da fila (cache de prefixo). Imprime só recibo e achados.
#
# Uso:
#   ds-queue.sh -d <dir> -A aceite.txt -s 'glob' [-s ...] [-S sessao-runner]
#               [-V sessao-reviewer] [-t 2400] [-C 'checagem' [-C ...]] [-T 900]
#               -- issue1.md [issue2.md ...]
#
# -A: texto fixo de regras/aceite, anexado a toda mensagem (mesmo texto em toda
#     issue = prefixo estável). Caminhos das issues relativos à raiz do repo.
# -C: checagem determinística rodada pelo script (sem LLM) depois de cada runner,
#     na raiz do repo, via quiet.sh com teto -T (padrão 900s). Falhou = issue
#     marcada `falhou <log>` e fila parada (exit 5), sem reverter nada.
# -P: sessão de runner e reviewer nova a cada issue (padrão: uma por fila).
# Para na primeira issue cujo runner saia com exit diferente de 0 e 3
# (3 = FORA DO ESCOPO, reportado mas não bloqueia; revise o recibo).
# Exit 4 do ds-run.sh = conflito de posse com outra chamada ativa: fila parada.
# Checkpoint em <git-dir>/ds-queue/state/<issue-id> (implementada|revisada):
# rodar a mesma fila de novo retoma dali (`falhou` refaz a implementação). Refazer uma issue = apagar o arquivo.
# Falha, timeout ou recibo ausente do reviewer preserva `implementada` para repetir só a revisão.
# Não edite este arquivo enquanto uma fila roda: o bash lê o script aos poucos.

set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
dir="" accept="" rs="" vs="" timeout_s=2400 check_s=900 model="${GOVKIT_MODEL:-}"
scopes=() checks=() paths=() per_issue=0
while getopts "d:A:s:S:V:t:C:T:P" opt; do
  case "$opt" in
    d) dir="$OPTARG" ;; A) accept="$OPTARG" ;; s) scopes+=(-s "$OPTARG"); paths+=("$OPTARG") ;;
    S) rs="$OPTARG" ;; V) vs="$OPTARG" ;; t) timeout_s="$OPTARG" ;;
    C) checks+=("$OPTARG") ;; T) check_s="$OPTARG" ;; P) per_issue=1 ;;
    *) echo "opção inválida" >&2; exit 2 ;;
  esac
done
shift $((OPTIND - 1)); [ "${1:-}" = "--" ] && shift
[ -n "$dir" ] && [ -f "$accept" ] && [ ${#scopes[@]} -gt 0 ] && [ $# -gt 0 ] \
  || { echo "uso: ds-queue.sh -d <dir> -A aceite.txt -s glob -- issue.md ..." >&2; exit 2; }

cd "$dir" || exit 2
win="$(pwd -W 2>/dev/null || pwd)"
work="$(mktemp -d)"
state="$(git rev-parse --absolute-git-dir)/ds-queue/state"; mkdir -p "$state"
echo "── ds-queue: logs em $work"

for issue in "$@"; do
  id="$(basename "$(dirname "$(dirname "$issue")")")-$(basename "$issue" .md)"
  [ $per_issue -eq 1 ] && rs="" vs=""  # -P: sessão nova por issue
  stage="$(cat "$state/$id" 2>/dev/null)"
  if [ "$stage" = revisada ]; then echo "##### $id já revisada (checkpoint) — pulando"; continue; fi
  if [ "$stage" = implementada ]; then echo "##### $id já implementada (checkpoint) — só revisão"; else
  { echo "$win"; echo "Issue da fila: $issue (leia-a inteira)."; cat "$accept"; } > "$work/$id.msg"
  sargs=(); [ -n "$rs" ] && sargs=(-S "$rs")
  "$here/ds-run.sh" -d "$PWD" -t "$timeout_s" -L "$id" "${sargs[@]}" "${scopes[@]}" -f "$work/$id.msg" > "$work/$id.out" 2>&1
  rc=$?
  rs="$(grep -o 'sessao=[^ ]*' "$work/$id.out" | tail -1 | cut -d= -f2)"
  echo "##### $id runner exit=$rc sessao=$rs"
  sel="$(sed -n '/ACEITE/,/FONTES/p;/CHECKLIST/,/NOTA/p;/FORA DO ESCOPO/,$p' "$work/$id.out")"
  [ -n "$sel" ] || sel="$(echo "(recibo sem marcadores; últimas linhas)"; tail -30 "$work/$id.out")"
  printf '%s
' "$sel" | cut -c1-240 | tail -30
  if [ $rc -ne 0 ] && [ $rc -ne 3 ]; then echo "── fila parada em $id (exit $rc)"; exit $rc; fi
  echo "##### $id diff (git, não o agente):"
  git diff --stat -- "${paths[@]}" 2>/dev/null | tail -15
  git ls-files --others --exclude-standard -- "${paths[@]}" | sed 's/^/  novo: /'
  for c in "${checks[@]}"; do
    clog="$work/$id.check.log"
    if ! bash "$here/quiet.sh" -t "$check_s" -l "$clog" -n 25 -- bash -c "$c"; then
      echo "falhou $clog" > "$state/$id"
      echo "── fila parada em $id: checagem falhou ($c); log $clog"; exit 5
    fi
    echo "##### $id checagem ok: $c"
  done
  echo implementada > "$state/$id"
  fi

  vtitle="dsqueue-rev-$id-$$"
  vargs=(--title "$vtitle"); [ -n "$vs" ] && vargs=(--session "$vs")
  model_args=(); [ -n "$model" ] && model_args=(-m "$model")
  bash "$here/tree-timeout.sh" 900 -- opencode run --standalone "${vargs[@]}" --agent ds-reviewer "${model_args[@]}" "$win
Revise o git diff do escopo (inclua não rastreados) contra $issue. Só bug real ou risco com severidade, e teste que passa sem a mudança." < /dev/null > "$work/$id.rev" 2>&1
  vrc=$?
  if [ "$vrc" -ne 0 ]; then
    echo "── fila parada em $id: reviewer exit=$vrc; log $work/$id.rev" >&2
    tail -30 "$work/$id.rev" >&2
    exit "$vrc"
  fi
  if ! grep -Eq '^No issues\.$|^totals:|^[^[:space:]]+:[0-9]+: (🔴|🟡|🔵|❓)' "$work/$id.rev"; then
    echo "── fila parada em $id: reviewer sem recibo conclusivo; log $work/$id.rev" >&2
    tail -30 "$work/$id.rev" >&2
    exit 6
  fi
  [ -n "$vs" ] || vs="$(opencode session list -n 50 2>/dev/null | awk -F'	' -v t="$vtitle" '$2==t{print $1; exit}')"
  echo "##### $id reviewer sessao=$vs"
  grep -E "🔴|🟡|❓|totals|No issues\." "$work/$id.rev" | cut -c1-240 | tail -12
  echo revisada > "$state/$id"
done
echo "── ds-queue: fim; sessoes runner=$rs reviewer=$vs"
