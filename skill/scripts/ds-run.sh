#!/usr/bin/env bash
# Wrapper de `opencode run` com auditoria de escopo do worktree.
#
# Tira um snapshot (caminho + hash de conteúdo) de todo arquivo sujo/não
# rastreado antes e depois da chamada e lista o que mudou. Arquivos que mudaram
# e não casam com nenhum --scope são reportados como FORA DO ESCOPO (exit 3).
# Nada é revertido automaticamente: a revisão fica com a CLI orquestradora.
#
# Uso:
#   ds-run.sh -d <dir> [-a ds-runner] [-m provider/model] [-t 1800]
#             -s 'src/*' [-s ...]
#             [-S <session-id>] (-f mensagem.txt | -- "mensagem")
#
# -S continua uma sessão existente (reaproveita o prefixo em cache); o id da
# sessão usada sai na linha "── ds-run: ... sessao=<id>".
#
# -s usa glob do bash relativo à raiz do repositório (`*` casa `/`).
# -L <rótulo> identifica a chamada (ex.: issue) no registro de posse.
#
# Posse: cada chamada registra seus -s em <git-dir>/ds-queue/claims/. Posse
# ativa de outra chamada que se sobrepõe à sua = recusa (exit 4, "conflito de
# posse"). Globs de outras chamadas ativas viram `edit: deny` num agente
# temporário (o OPENCODE_PERMISSION de ambiente não sobrepõe o frontmatter do
# agente, testado) e aparecem na mensagem como só leitura. No relatório, arquivo
# alterado que casa com posse alheia sai como "de outro agente", não FORA DO
# ESCOPO. Posse com pid morto é descartada.
# Exit: código do opencode; 3 se houve mudança fora do escopo; 124 em timeout.

set -uo pipefail
tt="$(cd "$(dirname "$0")" && pwd)/tree-timeout.sh"

dir="" agent="ds-runner" model="${GOVKIT_MODEL:-}" timeout_s=1800 msg_file="" session="" label=""
scopes=()

while getopts "d:a:m:t:s:f:S:L:" opt; do
  case "$opt" in
    d) dir="$OPTARG" ;;
    a) agent="$OPTARG" ;;
    m) model="$OPTARG" ;;
    t) timeout_s="$OPTARG" ;;
    s) scopes+=("$OPTARG") ;;
    f) msg_file="$OPTARG" ;;
    S) session="$OPTARG" ;;
    L) label="$OPTARG" ;;
    *) echo "opção inválida" >&2; exit 2 ;;
  esac
done
shift $((OPTIND - 1))
[ "${1:-}" = "--" ] && shift

[ -n "$dir" ] || { echo "falta -d <dir>" >&2; exit 2; }
[ ${#scopes[@]} -gt 0 ] || { echo "falta ao menos um -s <glob>" >&2; exit 2; }
if [ -n "$msg_file" ]; then msg="$(cat "$msg_file")"; else msg="$*"; fi
[ -n "$msg" ] || { echo "falta a mensagem (-f arquivo ou -- \"texto\")" >&2; exit 2; }

cd "$dir" || exit 2
root="$(git rev-parse --show-toplevel)" || { echo "$dir não é repositório git" >&2; exit 2; }
agent_dir="${GOVKIT_AGENT_DIR:-$root/.opencode/agents}"
[ -f "$agent_dir/$agent.md" ] || { echo "agente ausente: $agent_dir/$agent.md" >&2; exit 2; }

snapshot() {
  # Caminhos relativos à raiz; hash do conteúdo atual (ou DELETED).
  git -C "$root" status --porcelain=v1 -uall -z | tr '\0' '\n' | while IFS= read -r line; do
    [ -n "$line" ] || continue
    path="${line:3}"
    case "${line:0:2}" in R*|C*) continue ;; esac  # destino de rename vem na própria linha
    if [ -f "$root/$path" ]; then
      printf '%s\t%s\n' "$(git -C "$root" hash-object -- "$path")" "$path"
    else
      printf 'DELETED\t%s\n' "$path"
    fi
  done | sort -k2
}


# ── posse ───────────────────────────────────────────────────────────────
qdir="$(git -C "$root" rev-parse --absolute-git-dir)/ds-queue"
cdir="$qdir/claims"; mkdir -p "$cdir"
prefix_of() { local g="$1"; printf '%s' "${g%%[*?[]*}"; }
overlap() { # conservador: um prefixo literal contém o outro
  local a b; a="$(prefix_of "$1")"; b="$(prefix_of "$2")"
  [[ "$a" == "$b"* || "$b" == "$a"* ]]
}
alive() { kill -0 "$1" 2>/dev/null; }
acquire_mutex() { # mutex com dono: pid morto = mutex órfão, liberado
  local n=0 mp
  until mkdir "$qdir/mutex" 2>/dev/null; do
    mp="$(cat "$qdir/mutex/pid" 2>/dev/null)"
    if [ -n "$mp" ] && ! alive "$mp"; then rm -rf "$qdir/mutex"; echo "── ds-run: mutex órfão do pid $mp liberado" >&2; continue; fi
    n=$((n+1)); [ $n -gt 100 ] && { echo "mutex preso: $qdir/mutex" >&2; exit 2; }; sleep 0.2
  done
  echo $$ > "$qdir/mutex/pid"
}
release_mutex() { rm -rf "$qdir/mutex"; }

others=() others_label=()
acquire_mutex
for f in "$agent_dir"/*-lk*.md; do # agente temporário órfão
  [ -e "$f" ] || continue
  lp="${f##*-lk}"; lp="${lp%.md}"
  alive "$lp" || rm -f "$f"
done
for c in "$cdir"/*.claim; do
  [ -e "$c" ] || continue
  cpid="$(basename "$c" .claim)"
  alive "$cpid" || { rm -f "$c"; continue; }
  clabel="$(sed -n 's/^label=//p' "$c")"
  while IFS= read -r g; do
    for mine in "${scopes[@]}"; do
      if overlap "$mine" "$g"; then
        release_mutex
        echo "── ds-run: conflito de posse — '$mine' sobrepõe '$g' de $clabel (pid $cpid)" >&2
        exit 4
      fi
    done
    others+=("$g"); others_label+=("$clabel")
  done < <(sed -n 's/^glob=//p' "$c")
done
myclaim="$cdir/$$.claim"
{ echo "label=${label:-$agent}"; echo "agent=$agent"; echo "start=$(date +%s)"
  for g in "${scopes[@]}"; do echo "glob=$g"; done; } > "$myclaim"
release_mutex

run_agent="$agent" tmp_agent=""
if [ ${#others[@]} -gt 0 ]; then
  src="$agent_dir/$agent.md"
  if grep -q '^  edit:$' "$src" 2>/dev/null; then
    run_agent="$agent-lk$$"; tmp_agent="$agent_dir/$run_agent.md"
    printf '%s\n' "${others[@]}" > "$tmp_agent.globs"
    awk -v gf="$tmp_agent.globs" '
      BEGIN { while ((getline g < gf) > 0) if (g != "") G[++n] = g }
      inedit && !/^    / { for (i = 1; i <= n; i++) { printf "    \"%s\": deny\n", G[i]; printf "    \"%s*\": deny\n", G[i] } inedit = 0 }
      { print }
      /^  edit:$/ { inedit = 1 }
    ' "$src" > "$tmp_agent"
    rm -f "$tmp_agent.globs"
  fi
  ro="$(for i in "${!others[@]}"; do printf '%s (%s); ' "${others[$i]}" "${others_label[$i]}"; done)"
  msg="$msg
Em uso por outros agentes — só leitura, não edite: $ro"
fi
cleanup_claim() { rm -f "$myclaim" "$tmp_agent"; }

before="$(mktemp)"; after="$(mktemp)"
# Sessão nova ganha título único; o id é achado pelo título, não por "a mais
# recente" (chamadas paralelas pegavam a sessão uma da outra). O título também
# é a tag do registro de processos: no fim, o ds-kill.sh mata o que sobrou.
title="dsrun-${label:-$agent}-$$-$(date +%s)"
export DSRUN_TAG="$title" DSRUN_PROCS="$qdir/procs"
mkdir -p "$DSRUN_PROCS/$title"; echo $$ > "$DSRUN_PROCS/$title/.owner"
kill_sh="$(dirname "$tt")/ds-kill.sh"
bash "$kill_sh" -q -d "$root" --orphans
trap 'rm -f "$before" "$after"; cleanup_claim; bash "$kill_sh" -q -d "$root" "$DSRUN_TAG"' EXIT
snapshot > "$before"

started=$(date +%s)
session_args=(--title "$title"); [ -n "$session" ] && session_args=(--session "$session")
model_args=(); [ -n "$model" ] && model_args=(-m "$model")
bash "$tt" "$timeout_s" -- opencode run --standalone "${session_args[@]}" --agent "$run_agent" "${model_args[@]}" "$msg" < /dev/null
rc=$?
[ -n "$session" ] || session="$(opencode session list -n 50 2>/dev/null | awk -F'	' -v t="$title" '$2==t{print $1; exit}')"
elapsed=$(( $(date +%s) - started ))
snapshot > "$after"

# Mudou = linha (hash+caminho) presente só em um dos lados.
mapfile -t changed < <(diff <(cat "$before") <(cat "$after") | grep -E '^[<>]' | cut -f2- | sort -u)

shopt -s extglob
out=() foreign=()
for p in "${changed[@]}"; do
  ok=0
  for g in "${scopes[@]}"; do
    # shellcheck disable=SC2053
    [[ "$p" == $g ]] && { ok=1; break; }
  done
  if [ $ok -eq 0 ]; then
    for i in "${!others[@]}"; do
      # shellcheck disable=SC2053
      [[ "$p" == ${others[$i]} ]] && { ok=2; foreign+=("$p (${others_label[$i]})"); break; }
    done
  fi
  [ $ok -eq 0 ] && out+=("$p")
done

echo
echo "── ds-run: agente=$agent modelo=${model:-configuração do projeto} opencode_exit=$rc tempo=${elapsed}s sessao=${session}"
echo "── alterados na chamada (${#changed[@]}):"
for p in "${changed[@]}"; do echo "   $p"; done
if [ ${#foreign[@]} -gt 0 ]; then
  echo "── de outro agente (${#foreign[@]}) — informativo:"
  for p in "${foreign[@]}"; do echo "   · $p"; done
fi
if [ ${#out[@]} -gt 0 ]; then
  echo "── FORA DO ESCOPO (${#out[@]}) — revisar antes de remover/reverter:"
  for p in "${out[@]}"; do echo "   ! $p"; done
  [ $rc -eq 0 ] && rc=3
fi
exit $rc
