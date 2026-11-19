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

fn run_plugin_agent_guard() {
    let (raw, _) = read_stdin_limited(MAX_STDIN_AUDIT);
    let mut payload = Value::Null;
    let motivo = match serde_json::from_str::<Value>(&raw) {
        Ok(v) if v.is_object() => {
            payload = v;
            avaliar_plugin_agent_guard(&payload)
        }
        _ => Some("entrada do hook inválida".to_string()),
    };
    if let Some(m) = motivo {
        registrar(
            &payload,
            Some(AuditExtra {
                bloqueado: true,
                motivo: Some("politica_do_agente"),
                erro: None,
            }),
        );
        let out = json!({
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": m,
            }
        });
        let _ = io::stdout().write_all(out.to_string().as_bytes());
    }
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
        "agent-audit" => run_agent_audit(),
        "rtk-hook" => run_rtk_hook(),
        "statusline" => run_statusline(),
        "--version" | "-V" => {
            println!("oathbound-hook {}", env!("CARGO_PKG_VERSION"));
        }
        _ => {
            eprintln!("Usage: oathbound-hook <plugin-agent-guard|agent-audit|rtk-hook|statusline>");
            std::process::exit(2);
        }
    }
}
