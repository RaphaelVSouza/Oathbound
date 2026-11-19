mod guards;

use guards::audit::{registrar, registrar_falha, AuditExtra};
use guards::{destructive, read_size, readonly, rtk_hook, statusline};
use serde_json::{json, Value};
use std::env;
use std::io::{self, Read, Write};

const MAX_STDIN_AUDIT: usize = 16 * 1024 * 1024;
const MAX_STDIN_RTK: usize = 1024 * 1024;

fn read_stdin_limited(limit: usize) -> (String, bool) {
    let mut buf = Vec::new();
    let mut handle = io::stdin().take((limit + 1) as u64);
    let _ = handle.read_to_end(&mut buf);
    if buf.len() > limit {
        let prefix = String::from_utf8_lossy(&buf[..limit.min(4096)]).to_string();
        return (prefix, true);
    }
    (String::from_utf8_lossy(&buf).to_string(), false)
}

fn avaliar_plugin_agent_guard(payload: &Value) -> Option<String> {
    let agent_type = payload.get("agent_type").and_then(|v| v.as_str())?;
    match agent_type {
        "oathbound:assayer" | "oathbound:sentinel" => {
            if payload.get("tool_name").and_then(|v| v.as_str()) == Some("Bash") {
                let cmd = payload
                    .get("tool_input")
                    .and_then(|v| v.get("command"))
                    .and_then(|v| v.as_str());
                if let Some(motivo) = readonly::avaliar(cmd) {
                    return Some(motivo);
                }
            }
            read_size::avaliar(payload)
        }
        "oathbound:scout" => {
            if payload.get("tool_name").and_then(|v| v.as_str()) == Some("Read") {
                read_size::avaliar(payload)
            } else {
                None
            }
        }
        "oathbound:smith" | "oathbound:scribe" => destructive::avaliar(payload),
        _ => None,
    }
}

fn emit_deny(payload: &Value, motivo_audit: &'static str, reason: &str) {
    registrar(
        payload,
        Some(AuditExtra {
            bloqueado: true,
            motivo: Some(motivo_audit),
            erro: None,
        }),
    );
    let out = json!({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    });
    let _ = io::stdout().write_all(out.to_string().as_bytes());
}

fn run_guard(motivo_audit: &'static str, eval: fn(&Value) -> Option<String>) {
    let (raw, _) = read_stdin_limited(MAX_STDIN_AUDIT);
    let mut payload = Value::Null;
    let motivo = match serde_json::from_str::<Value>(&raw) {
        Ok(v) if v.is_object() => {
            payload = v;
            eval(&payload)
        }
        _ => Some("entrada do hook inválida".to_string()),
    };
    if let Some(m) = motivo {
        emit_deny(&payload, motivo_audit, &m);
    }
}

fn avaliar_readonly_payload(payload: &Value) -> Option<String> {
    let cmd = payload
        .get("tool_input")
        .and_then(|v| v.get("command"))
        .and_then(|v| v.as_str());
    readonly::avaliar(cmd)
}

fn run_plugin_agent_guard() {
    run_guard("politica_do_agente", avaliar_plugin_agent_guard);
}

fn run_readonly_guard() {
    run_guard("somente_leitura", avaliar_readonly_payload);
}

fn run_read_size_guard() {
    run_guard("limite_de_leitura", read_size::avaliar);
}

fn run_destructive_guard() {
    run_guard("comando_destrutivo", destructive::avaliar);
}

fn run_agent_audit() {
    let (raw, oversized) = read_stdin_limited(MAX_STDIN_AUDIT);
    if oversized {
        registrar_falha(&raw, "stdin_grande");
        return;
    }
    match serde_json::from_str::<Value>(&raw) {
        Ok(v) if v.is_object() => {
            registrar(&v, None);
        }
        _ => {
            registrar_falha(&raw, "json_invalido");
        }
    }
}

fn run_codex_agent_audit() {
    let (raw, oversized) = read_stdin_limited(MAX_STDIN_AUDIT);
    if oversized {
        return;
    }
    if let Ok(mut payload) = serde_json::from_str::<Value>(&raw) {
        let event = match payload.get("hook_event_name").and_then(Value::as_str) {
            Some("SubagentStart") => "SubagentStart",
            Some("SubagentStop") => "SubagentStop",
            _ => return,
        };
        payload["tool_name"] = json!(event);
        registrar(&payload, None);
    }
}

fn run_rtk_hook() {
    let (raw, oversized) = read_stdin_limited(MAX_STDIN_RTK);
    let out = rtk_hook::run(&raw, oversized);
    let _ = io::stdout().write_all(out.as_bytes());
}

fn run_statusline() {
    let (raw, oversized) = read_stdin_limited(MAX_STDIN_RTK);
    let out = statusline::run(&raw, oversized);
    let _ = io::stdout().write_all(out.as_bytes());
}

fn main() {
    let sub = env::args().nth(1).unwrap_or_default();
    match sub.as_str() {
        "plugin-agent-guard" => run_plugin_agent_guard(),
        "readonly-guard" => run_readonly_guard(),
        "read-size-guard" => run_read_size_guard(),
        "destructive-guard" => run_destructive_guard(),
        "agent-audit" => run_agent_audit(),
        "codex-agent-audit" => run_codex_agent_audit(),
        "rtk-hook" => run_rtk_hook(),
        "statusline" => run_statusline(),
        "--version" | "-V" => {
            println!("oathbound-hook {}", env!("CARGO_PKG_VERSION"));
        }
        _ => {
            eprintln!("Usage: oathbound-hook <plugin-agent-guard|readonly-guard|read-size-guard|destructive-guard|agent-audit|codex-agent-audit|rtk-hook|statusline>");
            std::process::exit(2);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn plugin_agent_guard_blocks_read_over_limit_for_readers() {
        for agent in ["oathbound:assayer", "oathbound:sentinel", "oathbound:scout"] {
            let p = json!({
                "agent_type": agent,
                "tool_name": "Read",
                "tool_input": { "file_path": "a.js", "limit": 151 }
            });
            assert!(avaliar_plugin_agent_guard(&p).is_some(), "expected deny for {agent}");
        }
    }

    #[test]
    fn plugin_agent_guard_allows_safe_read_and_blocks_destructive_for_writers() {
        let safe = json!({
            "agent_type": "oathbound:smith",
            "tool_name": "Bash",
            "tool_input": { "command": "git status" }
        });
        assert!(avaliar_plugin_agent_guard(&safe).is_none());

        for agent in ["oathbound:smith", "oathbound:scribe"] {
            let commit = json!({
                "agent_type": agent,
                "tool_name": "Bash",
                "tool_input": { "command": "git commit -m x" }
            });
            assert!(avaliar_plugin_agent_guard(&commit).is_some(), "expected deny for {agent}");
        }

        let other = json!({
            "agent_type": "outro:scout",
            "tool_name": "Read",
            "tool_input": { "file_path": "a.js", "limit": 999 }
        });
        assert!(avaliar_plugin_agent_guard(&other).is_none());
    }

    #[test]
    fn destructive_guard_prefilter_catches_all_categories() {
        let cases = [
            "git commit -m x",
            "git branch -D foo",
            "rm -rf tmp",
            "find . -name '*.tmp' -delete",
            "gh pr create --title x",
            "npm publish",
            "bash -c 'echo hi'",
            "iex 'echo hi'",
        ];
        for cmd in cases {
            let p = json!({ "tool_name": "Bash", "tool_input": { "command": cmd } });
            assert!(destructive::avaliar(&p).is_some(), "expected deny for {cmd}");
        }
        let safe = json!({ "tool_name": "Bash", "tool_input": { "command": "cargo test -q" } });
        assert!(destructive::avaliar(&safe).is_none());
    }

    #[test]
    fn rtk_hook_blocks_find_and_gci_and_adjusts_wait() {
        let find_out = rtk_hook::run(r#"{"toolCall":{"args":{"CommandLine":"find . -name '*.js'"}}}"#, false);
        assert!(find_out.contains(r#""decision":"deny""#));

        let gci_out = rtk_hook::run(r#"{"toolCall":{"args":{"CommandLine":"Get-ChildItem -Recurse ."}}}"#, false);
        assert!(gci_out.contains(r#""decision":"deny""#));

        let node_out = rtk_hook::run(r#"{"toolCall":{"args":{"CommandLine":"node -e \"console.log('Get-ChildItem -Recurse')\""}}}"#, false);
        assert!(!node_out.contains(r#""decision":"deny""#));

        let wait_out = rtk_hook::run(r#"{"toolCall":{"args":{"CommandLine":"git status","WaitMsBeforeAsync":5000}}}"#, false);
        assert!(wait_out.contains(r#""WaitMsBeforeAsync":10000"#));
    }

    #[test]
    fn statusline_formats_basic_payload() {
        let out = statusline::run(
            r#"{"model":{"display_name":"Gemini 2.5 Pro"},"context_window":{"used_percentage":42},"cost":{"total_cost_usd":0.12}}"#,
            false,
        );
        assert!(out.contains("2.5 Pro"));
        assert!(out.contains("42%"));
    }
}
