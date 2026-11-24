#!/usr/bin/env python3
"""Valida um rascunho de AGENTS.md: orçamento de linhas, caminhos citados e segredos."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

SECRET_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("private_key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("aws_access_key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("github_token", re.compile(r"\bgh[pousr]_[A-Za-z0-9_]{20,}\b")),
    ("google_api_key", re.compile(r"\bAIza[0-9A-Za-z\-_]{35}\b")),
    ("openai_like_key", re.compile(r"\bsk-[A-Za-z0-9]{20,}\b")),
    (
        "inline_secret_assignment",
        re.compile(
            r"(?i)\b(?:api[_-]?key|secret|token|password|passwd)\b\s*[:=]\s*['\"][^'\"\s]{8,}['\"]"
        ),
    ),
]

PATH_TOKEN_RE = re.compile(r"`([^`\n]+)`")


def extract_candidate_paths(text: str) -> list[str]:
    """Extrai caminhos relativos citados em backticks que parecem arquivos/diretórios locais."""
    candidates: list[str] = []
    for token in PATH_TOKEN_RE.findall(text):
        token = token.strip()
        if not token or " " in token or "..." in token or "*" in token:
            continue
        if token.startswith(("http://", "https://", "-", "--", "$", "<")):
            continue
        if "/" not in token and "\\" not in token:
            continue
        # Ignora flags/comandos comuns com barra (ex: CI/CD, lint/typecheck)
        if token.lower() in {"ci/cd", "lint/typecheck"}:
            continue
        candidates.append(token.rstrip(".,;:"))
    return sorted(set(candidates))


def validate_agents_md(
    file_path: Path,
    repo_root: Path,
    target_lines: int = 60,
    ceiling_lines: int = 80,
    hard_fail_lines: int = 150,
) -> int:
    """Executa checagens e retorna 0 se aprovado, 1 se reprovado."""
    if not file_path.is_file():
        print(f"ERROR: arquivo não encontrado: {file_path}", file=sys.stderr)
        return 1

    content = file_path.read_text(encoding="utf-8")
    lines = content.splitlines()
    line_count = len(lines)

    errors: list[str] = []
    warnings: list[str] = []

    if line_count > hard_fail_lines:
        errors.append(f"Orçamento excedido: {line_count} linhas (limite máximo {hard_fail_lines}; reprovado).")
    elif line_count > ceiling_lines:
        warnings.append(f"Acima do teto recomendado: {line_count} linhas (teto {ceiling_lines}, padrão {target_lines}).")
    elif line_count > target_lines:
        warnings.append(f"Acima do padrão: {line_count} linhas (padrão {target_lines}, teto {ceiling_lines}).")

    for name, pattern in SECRET_PATTERNS:
        for idx, line in enumerate(lines, start=1):
            if pattern.search(line):
                errors.append(f"Possível segredo ({name}) na linha {idx}.")

    missing_paths: list[str] = []
    for cand in extract_candidate_paths(content):
        resolved = (repo_root / cand).resolve()
        if not resolved.exists():
            missing_paths.append(cand)
    if missing_paths:
        warnings.append("Caminhos citados não encontrados no repositório: " + ", ".join(missing_paths))

    print(f"FILE: {file_path} ({line_count} linhas | padrão<={target_lines} teto<={ceiling_lines} max<={hard_fail_lines})")
    for w in warnings:
        print(f"WARN: {w}")
    for e in errors:
        print(f"FAIL: {e}")

    if not errors and not warnings:
        print("OK: aprovado sem alertas.")
    return 1 if errors else 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Valida orçamento, caminhos e segredos de um AGENTS.md.")
    parser.add_argument("file", type=Path, help="Caminho para o AGENTS.md (ou rascunho)")
    parser.add_argument("--root", type=Path, default=None, help="Raiz do repositório (padrão: pasta do arquivo)")
    parser.add_argument("--target", type=int, default=60, help="Orçamento padrão de linhas (60)")
    parser.add_argument("--ceiling", type=int, default=80, help="Teto de linhas (80)")
    parser.add_argument("--max-lines", type=int, default=150, help="Limite de reprovação (150)")
    args = parser.parse_args()

    repo_root = args.root if args.root is not None else args.file.resolve().parent
    return validate_agents_md(args.file, repo_root, args.target, args.ceiling, args.max_lines)


if __name__ == "__main__":
    raise SystemExit(main())
