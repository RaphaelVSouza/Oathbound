use regex::Regex;
use serde_json::Value;
use std::sync::OnceLock;

const INICIO: &str = r"(?i)(?:^|[;&|\n(]|&&)\s*(?:rtk\s+(?:proxy\s+)?)?";
const GIT_OPCOES: &str = r"(?:\s+(?:--no-pager|-C\s+\S+|-c\s+\S+))*";

struct Regra {
    re: Regex,
    motivo: fn(&regex::Captures<'_>) -> String,
}

fn regras() -> &'static [Regra] {
    static REGRAS: OnceLock<Vec<Regra>> = OnceLock::new();
    REGRAS.get_or_init(|| {
        vec![
            Regra {
                re: Regex::new(&format!(
                    r"{INICIO}git{GIT_OPCOES}\s+(commit|push|reset|clean|rebase|merge|cherry-pick|revert|am|apply|stash|checkout|restore|switch|filter-branch|gc|prune|update-ref|config|remote)\b"
                ))
                .unwrap(),
                motivo: |m| format!("git {} muda histórico, estado ou remoto", &m[1]),
            },
            Regra {
                re: Regex::new(&format!(
                    r"{INICIO}git{GIT_OPCOES}\s+(branch\s+(?:-\S*[dDmM]\S*|--delete|--move)|tag\s+(?:-\S*d\S*|--delete)|reflog\s+(?:expire|delete))\b"
                ))
                .unwrap(),
                motivo: |m| {
                    let sub = m[1].split_whitespace().next().unwrap_or("");
                    format!("git {sub} apaga ou move referência")
                },
            },
            Regra {
                re: Regex::new(&format!(
                    r"{INICIO}(rm|rmdir|del|erase|rd|remove-item|ri|unlink|shred)\b"
                ))
                .unwrap(),
                motivo: |m| format!("{} remove arquivo ou pasta", &m[1]),
            },
            Regra {
                re: Regex::new(r"(?i)\bfind\b[^;&|\n]*\s-(delete|exec|execdir)\b").unwrap(),
                motivo: |_| "find com ação de remoção/execução".to_string(),
            },
            Regra {
                re: Regex::new(&format!(
                    r"{INICIO}gh\s+(pr\s+(create|merge|close|edit|comment|review|ready)|issue\s+(create|close|edit|comment|delete)|release\b|repo\s+(create|delete|edit|rename)|api\b[^;&|\n]*(-X|--method)\s*(POST|PUT|PATCH|DELETE))"
                ))
                .unwrap(),
                motivo: |_| "gh faz escrita remota".to_string(),
            },
            Regra {
                re: Regex::new(&format!(r"{INICIO}(npm|pnpm|yarn)\s+publish\b")).unwrap(),
                motivo: |_| "publish é escrita remota".to_string(),
            },
            Regra {
                re: Regex::new(&format!(
                    r"{INICIO}(bash|sh|zsh|cmd|powershell|pwsh)(?:\.exe)?\b[^;&|\n]*\s(-c|-command|-encodedcommand|/c)\b"
                ))
                .unwrap(),
                motivo: |_| "wrapper de shell esconde o comando real".to_string(),
            },
            Regra {
                re: Regex::new(&format!(r"{INICIO}(eval|invoke-expression|iex)\b")).unwrap(),
                motivo: |_| "eval/Invoke-Expression esconde o comando real".to_string(),
            },
        ]
    })
}

pub fn avaliar(payload: &Value) -> Option<String> {
    let ferramenta = payload.get("tool_name").and_then(|v| v.as_str())?;
    if ferramenta != "Bash" && ferramenta != "PowerShell" {
        return None;
    }
    let Some(cmd) = payload
        .get("tool_input")
        .and_then(|v| v.get("command"))
        .and_then(|v| v.as_str())
    else {
        return Some("comando vazio ou ausente".to_string());
    };
    if cmd.trim().is_empty() {
        return Some("comando vazio ou ausente".to_string());
    }
    for r in regras() {
        if let Some(m) = r.re.captures(cmd) {
            return Some((r.motivo)(&m));
        }
    }
    None
}
