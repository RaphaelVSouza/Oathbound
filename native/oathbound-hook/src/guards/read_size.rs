use crate::guards::readonly::{dividir, nome_comando};
use serde_json::Value;

const MAX_LINHAS: i64 = 150;
const RESUMOS_GIT: &[&str] = &[
    "--stat",
    "--name-only",
    "--name-status",
    "--numstat",
    "--shortstat",
    "--summary",
    "--check",
];

fn limite_de(args: &[String], flags_curtos: &[&str], flags_longos: &[&str]) -> Option<Result<i64, ()>> {
    for i in 0..args.len() {
        let a = args[i].to_ascii_lowercase();
        let mut v: Option<&str> = None;

        for f in flags_longos {
            if a == *f {
                v = args.get(i + 1).map(|s| s.as_str());
            } else if let Some(rest) = a.strip_prefix(f).and_then(|r| r.strip_prefix('=')) {
                v = Some(rest);
            }
        }
        for f in flags_curtos {
            if a == *f {
                v = args.get(i + 1).map(|s| s.as_str());
            } else if let Some(rest) = a.strip_prefix(f) {
                if !rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit()) {
                    v = Some(rest);
                }
            }
        }
        if v.is_none() && a.starts_with('-') && a.len() > 1 && a[1..].chars().all(|c| c.is_ascii_digit()) {
            v = Some(&a[1..]);
        }
        if let Some(raw) = v {
            let cleaned = raw.strip_prefix('+').unwrap_or(raw);
            return Some(cleaned.parse::<i64>().map_err(|_| ()));
        }
    }
    None
}

fn verifica_segmento(tokens: &[String]) -> Option<String> {
    let mut start = 0;
    if nome_comando(&tokens[0]) == "rtk" {
        start += 1;
        if tokens.get(start).map(|s| s.as_str()) == Some("proxy") {
            start += 1;
        }
        if start >= tokens.len() {
            return None;
        }
        if tokens[start] == "read" {
            return Some("rtk read lê arquivo inteiro. Use Read com offset e limit".to_string());
        }
    }
    let cmd = nome_comando(&tokens[start]);
    let args = &tokens[start + 1..];

    if matches!(cmd.as_str(), "cat" | "get-content" | "gc" | "type") {
        if matches!(cmd.as_str(), "get-content" | "gc") {
            if let Some(Ok(n)) = limite_de(args, &[], &["-totalcount", "-tail", "-first"]) {
                if n <= MAX_LINHAS {
                    return None;
                }
            }
        }
        return Some(format!(
            "{cmd} lê arquivo inteiro. Use Read com offset e limit (<= {MAX_LINHAS}) ou Grep -n"
        ));
    }
    if matches!(cmd.as_str(), "head" | "tail") {
        match limite_de(args, &["-n"], &["--lines"]) {
            Some(Ok(n)) if n <= MAX_LINHAS => {}
            _ => return Some(format!("{cmd} exige -n <= {MAX_LINHAS}")),
        }
        if args.iter().any(|a| a.starts_with("-c") || a.starts_with("--bytes")) {
            return Some(format!("{cmd} -c não permitido; use -n <= {MAX_LINHAS}"));
        }
        return None;
    }
    if cmd == "git" {
        let mut i = 0;
        while i < args.len() {
            if args[i] == "--no-pager" {
                i += 1;
            } else if args[i] == "-C" && i + 1 < args.len() {
                i += 2;
            } else {
                break;
            }
        }
        let Some(sub) = args.get(i) else {
            return None;
        };
        if sub != "diff" && sub != "show" {
            return None;
        }
        let resto = &args[i + 1..];
        if resto.iter().any(|a| RESUMOS_GIT.contains(&a.as_str())) {
            return None;
        }
        if resto.iter().any(|a| a == "--") {
            return None;
        }
        return Some(format!(
            "git {sub} sem --stat/--name-only nem caminho (-- <arquivo>) pode trazer diff enorme. Rode --stat primeiro e revise por arquivo"
        ));
    }
    None
}

fn avaliar_bash(command: Option<&str>) -> Option<String> {
    let Some(cmd) = command else {
        return Some("comando vazio ou ausente".to_string());
    };
    if cmd.trim().is_empty() {
        return Some("comando vazio ou ausente".to_string());
    }
    let segmentos = match dividir(cmd) {
        Ok(s) => s,
        Err(erro) => return Some(format!("construção não permitida ({erro})")),
    };
    for seg in &segmentos {
        if let Some(motivo) = verifica_segmento(seg) {
            return Some(motivo);
        }
    }
    None
}

fn avaliar_read(input: Option<&Value>) -> Option<String> {
    let limit = input.and_then(|v| v.get("limit")).and_then(|v| v.as_i64());
    match limit {
        Some(n) if n > MAX_LINHAS => {
            Some(format!("Read com limit {n} > {MAX_LINHAS}. Fatie a leitura"))
        }
        Some(n) if n > 0 => None,
        _ => Some(format!("Read sem limit. Passe offset e limit <= {MAX_LINHAS}")),
    }
}

pub fn avaliar(payload: &Value) -> Option<String> {
    let ferramenta = payload.get("tool_name").and_then(|v| v.as_str())?;
    match ferramenta {
        "Read" => avaliar_read(payload.get("tool_input")),
        "Bash" => avaliar_bash(
            payload
                .get("tool_input")
                .and_then(|v| v.get("command"))
                .and_then(|v| v.as_str()),
        ),
        _ => None,
    }
}
