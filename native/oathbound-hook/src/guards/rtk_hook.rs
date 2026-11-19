use regex::Regex;
use serde_json::{json, Map, Value};
use std::process::{Command, Stdio};
use std::sync::OnceLock;

fn re_find() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)^(?:rtk\s+(?:proxy\s+)?)?find(?:\.exe)?\s+").unwrap())
}

fn re_node_e() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)^node\s+-e\b").unwrap())
}

fn re_gci_recurse() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)\b(?:Get-ChildItem|gci)\b[^\n|;]*\s-(?:Recurse|r)\b").unwrap())
}

pub fn run(raw: &str, oversized: bool) -> String {
    if oversized {
        return json!({ "decision": "allow" }).to_string();
    }
    let Ok(payload) = serde_json::from_str::<Value>(raw) else {
        return json!({ "decision": "allow" }).to_string();
    };

    let args = payload
        .get("toolCall")
        .and_then(|v| v.get("args"))
        .and_then(|v| v.as_object());

    let cmd = args
        .and_then(|a| a.get("CommandLine"))
        .and_then(|v| v.as_str())
        .map(|s| s.trim())
        .unwrap_or("");

    if re_find().is_match(cmd) {
        return json!({
            "decision": "deny",
            "reason": "Bloqueado pelo hook: no Windows `find` invoca `System32\\find.exe` e falha. Use `rtk rg --files <caminho>` ou `rtk rg --files -g \"<glob>\" <caminho>`."
        })
        .to_string();
    }

    if !re_node_e().is_match(cmd) && re_gci_recurse().is_match(cmd) {
        return json!({
            "decision": "deny",
            "reason": "Bloqueado pelo hook: `Get-ChildItem -Recurse` varre `.venv`, `node_modules` e `data`, estourando timeout e gerando tasks órfãs. Use `rtk rg --files <caminho>` (que respeita `.gitignore`/`.ignore`)."
        })
        .to_string();
    }

    let current_wait = args
        .and_then(|a| a.get("WaitMsBeforeAsync"))
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let is_daemon = args
        .and_then(|a| a.get("IsDaemon"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let mut overwrite = Map::new();
    if current_wait > 0 && current_wait < 10_000 && !is_daemon {
        overwrite.insert("WaitMsBeforeAsync".into(), json!(10_000));
    }

    if cmd.is_empty() || cmd.contains('\n') {
        if !overwrite.is_empty() {
            return json!({ "decision": "allow", "overwrite": overwrite }).to_string();
        }
        return json!({ "decision": "allow" }).to_string();
    }

    if let Ok(output) = Command::new("rtk")
        .args(["rewrite", cmd])
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
    {
        if let Ok(text) = String::from_utf8(output.stdout) {
            let rewritten = text.trim();
            if !rewritten.is_empty() && rewritten != cmd {
                overwrite.insert("CommandLine".into(), json!(rewritten));
                return json!({ "decision": "allow", "overwrite": overwrite }).to_string();
            }
        }
    }

    if !overwrite.is_empty() {
        return json!({ "decision": "allow", "overwrite": overwrite }).to_string();
    }
    json!({ "decision": "allow" }).to_string()
}
