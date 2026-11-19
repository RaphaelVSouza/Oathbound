# ADR 0004 — Hooks nativos em Rust para o hot path

Data: 2026-11-19. Estado: Fase 0 e Fase 1 (piloto Rust) concluídas e medidas.

## Contexto

Os hooks `PreToolUse` e a `statusline` rodam a cada chamada de ferramenta ou atualização de interface. Em Node.js (`v24.21.0`, `win32-x64`), o cold start de `node.exe` custa ~130–137 ms (p50) e até ~280 ms (p95) por invocação, somando latência perceptível em sessões com dezenas de tool calls.

## Decisão

1. **Escopo cirúrgico (hot path)**: migrar para binário nativo apenas os hooks síncronos de alta frequência:
   - `plugin-agent-guard` (agregando `readonly-guard`, `read-size-guard`, `destructive-guard`, `agent-audit` e `redigir`)
   - `agent-audit`
   - `rtk-hook`
   - `statusline`
   Manter em Node.js >= 24 o que é bound por rede (`skill-suggest.js`) ou roda raramente (`tools/install.ts`, `tools/audit-docs*.ts`, `tools/build-plugin.cjs`, `test/**`).

2. **Linguagem e formato**: Rust, compilado como um único binário multi-call `oathbound-hook` (`oathbound-hook.exe` no Windows) com subcomandos correspondentes a cada hook.
   - `regex` crate (tempo linear, sem risco de ReDoS); regras com lookahead negativo (ex.: `^(?!node\s+-e\b)` em `rtk-hook.js`) são convertidas em checagem de prefixo equivalente antes da regex.
   - Dependências mínimas (`serde`, `serde_json`, `regex`) e perfil `release` com `lto = true` e `strip = true`.

3. **Distribuição (Opção A — binários pré-compilados + fallback `.js`)**:
   - Convenção de artefatos por plataforma: `oathbound-hook-win32-x64.exe`, `oathbound-hook-linux-x64`, `oathbound-hook-darwin-arm64`.
   - Alvo primário: `win32-x64`, com estrutura já preparada para `linux-x64` e `darwin-arm64`.
   - Os scripts `.js` permanecem como fallback funcional quando o binário nativo não estiver disponível.

4. **Paridade e critério de aceite**:
   - A suíte existente (`test/hooks/*.test.js`) deve passar integralmente contra o binário nativo via `OATHBOUND_HOOK_BIN`.
   - Meta de latência em `win32-x64`: **p95 < 15 ms** nos hooks sem subprocesso externo (`plugin-agent-guard`, `agent-audit`, `rtk-hook` deny).

## Medição baseline (Node v24.21.0, win32-x64, 15 runs)

Medido com `rtk proxy node tools/bench-hooks.cjs --runs=15`:

| Hook | min (ms) | p50 (ms) | p95 (ms) | max (ms) |
| --- | ---: | ---: | ---: | ---: |
| `plugin-agent-guard` (allow) | 112.7 | 136.9 | 167.6 | 167.6 |
| `plugin-agent-guard` (deny) | 103.5 | 130.5 | 281.8 | 281.8 |
| `agent-audit` (append) | 121.6 | 133.0 | 235.6 | 235.6 |
| `rtk-hook` (deny find) | 112.7 | 137.0 | 196.3 | 196.3 |

## Medição piloto nativo (Rust 1.100.0 GNU, win32-x64, 15 runs)

Medido com `rtk proxy node tools/bench-hooks.cjs --runs=15 --bin=native/oathbound-hook/target/release/oathbound-hook.exe`:

| Hook | Node p50 (ms) | Nativo p50 (ms) | Ganho p50 | Node p95 (ms) | Nativo p95 (ms) | Ganho p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `plugin-agent-guard` (allow) | 136.9 | 77.7 | 1.8x | 167.6 | 108.5 | 1.5x |
| `plugin-agent-guard` (deny) | 130.5 | 75.5 | 1.7x | 281.8 | 112.3 | 2.5x |
| `agent-audit` (append) | 133.0 | 30.9 | 4.3x | 235.6 | 41.3 | 5.7x |
| `rtk-hook` (deny find) | 137.0 | 28.1 | 4.9x | 196.3 | 34.2 | 5.7x |

## Atualização (0.50.0-alpha.24): Rust-only no hot path + lazy regexes

Removido o fallback `.js` dos hooks de hot path (`plugin-agent-guard`, `readonly-guard`, `read-size-guard`, `destructive-guard`, `agent-audit`, `rtk-hook` e `statusline`) para eliminar duplicação e drift. `destructive.rs` passou a compilar regexes sob demanda após pré-filtro por substring:

| Hook | Node p50 (ms) | Nativo p50 (ms) | Ganho p50 | Nativo p95 (ms) |
| --- | ---: | ---: | ---: | ---: |
| `plugin-agent-guard` (allow) | 136.9 | 13.8 | 9.9x | 15.0 |
| `plugin-agent-guard` (deny) | 130.5 | 16.6 | 7.9x | 20.9 |
| `agent-audit` (append) | 133.0 | 17.3 | 7.7x | 21.2 |
| `rtk-hook` (deny find) | 137.0 | 16.9 | 8.1x | 19.2 |

## Consequências

- **Positivas**: redução estimada de >10x na latência de cold start dos hooks; zero dependência de Node em tempo de execução dos hooks; proteção contra ReDoS.
- **Negativas**: repositório passa a manter duas linguagens (Rust no hot path + Node/TS em `tools/` e `test/`); exige toolchain Rust (`rustup`) para desenvolvimento/compilação local e publicação de binários por plataforma.
