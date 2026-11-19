use regex::Regex;
use serde_json::{json, Map, Value};
use std::env;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const MAX_BYTES: u64 = 1024 * 1024;
const MAX_ARQUIVOS: usize = 3;
const CATEGORIAS: &[&str] = &[
    "somente_leitura",
    "limite_de_leitura",
    "acao_destrutiva",
    "politica_do_agente",
];

fn home_dir() -> Option<PathBuf> {
    env::var_os("USERPROFILE")
        .or_else(|| env::var_os("HOME"))
        .map(PathBuf::from)
}

fn dir_auditoria() -> Option<PathBuf> {
    if let Some(dir) = env::var_os("AGENT_AUDIT_DIR") {
        if !dir.is_empty() {
            return Some(PathBuf::from(dir));
        }
    }
    home_dir().map(|h| h.join(".claude").join("state"))
}

fn iso_now_utc() -> String {
    let dur = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::ZERO);
    let secs = dur.as_secs() as i64;
    let millis = dur.subsec_millis();
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    let hour = rem / 3600;
    let min = (rem % 3600) / 60;
    let sec = rem % 60;

    // Howard Hinnant's civil_from_days algorithm
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if m <= 2 { y + 1 } else { y };

    format!("{year:04}-{m:02}-{d:02}T{hour:02}:{min:02}:{sec:02}.{millis:03}Z")
}

fn com_trava<F: FnOnce()>(arquivo: &Path, f: F) {
    let mut lock_os = arquivo.as_os_str().to_os_string();
    lock_os.push(".lock");
    let trava = PathBuf::from(lock_os);

    let file = match OpenOptions::new().write(true).create_new(true).open(&trava) {
        Ok(fh) => Some(fh),
        Err(_) => {
            let expired = fs::metadata(&trava)
                .and_then(|m| m.modified())
                .ok()
                .and_then(|mt| SystemTime::now().duration_since(mt).ok())
                .map(|age| age > Duration::from_secs(5))
                .unwrap_or(false);
            if expired {
                let _ = fs::remove_file(&trava);
                OpenOptions::new().write(true).create_new(true).open(&trava).ok()
            } else {
                None
            }
        }
    };

    let Some(fh) = file else { return };
    f();
    drop(fh);
    let _ = fs::remove_file(&trava);
}

fn rotacionar(arquivo: &Path) {
    let size = match fs::metadata(arquivo) {
        Ok(m) => m.len(),
        Err(_) => return,
    };
    if size < MAX_BYTES {
        return;
    }
    com_trava(arquivo, || {
        let size = match fs::metadata(arquivo) {
            Ok(m) => m.len(),
            Err(_) => return,
        };
        if size < MAX_BYTES {
            return;
        }
        for i in (1..MAX_ARQUIVOS).rev() {
            let de = if i == 1 {
                arquivo.to_path_buf()
            } else {
                PathBuf::from(format!("{}.{}", arquivo.display(), i - 1))
            };
            let para = PathBuf::from(format!("{}.{}", arquivo.display(), i));
            if let Err(e) = fs::rename(&de, &para) {
                if e.kind() == std::io::ErrorKind::NotFound {
                    continue;
                }
                return;
            }
        }
    });
}

pub struct AuditExtra<'a> {
    pub bloqueado: bool,
    pub motivo: Option<&'a str>,
    pub erro: Option<&'a str>,
}

pub fn registrar(payload: &Value, extra: Option<AuditExtra<'_>>) -> bool {
    let Some(agent_id) = payload.get("agent_id").and_then(|v| v.as_str()) else {
        return false;
    };
    if agent_id.is_empty() {
        return false;
    }
    let Some(dir) = dir_auditoria() else {
        return false;
    };

    let mut linha = Map::new();
    linha.insert("ts".into(), json!(iso_now_utc()));
    let agente = payload
        .get("agent_type")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("desconhecido");
    linha.insert("agente".into(), json!(agente));
    linha.insert("agent_id".into(), json!(agent_id));
    let sessao: String = payload
        .get("session_id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .chars()
        .take(8)
        .collect();
    linha.insert("sessao".into(), json!(sessao));
    let ferramenta = payload
        .get("tool_name")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    linha.insert("ferramenta".into(), json!(ferramenta));

    if let Some(tuid) = payload.get("tool_use_id").and_then(|v| v.as_str()) {
        linha.insert("tool_use_id".into(), json!(tuid));
    }
    if let Some(ex) = extra {
        if ex.bloqueado {
            linha.insert("bloqueado".into(), json!(true));
        }
        if let Some(m) = ex.motivo {
            if CATEGORIAS.contains(&m) {
                linha.insert("motivo".into(), json!(m));
            }
        }
        if let Some(e) = ex.erro {
            let trunc: String = e.chars().take(40).collect();
            linha.insert("erro".into(), json!(trunc));
        }
    }

    if fs::create_dir_all(&dir).is_err() {
        return false;
    }
    let arquivo = dir.join("agent-audit.jsonl");
    rotacionar(&arquivo);

    let Ok(mut line) = serde_json::to_string(&Value::Object(linha)) else {
        return false;
    };
    line.push('\n');

    OpenOptions::new()
        .create(true)
        .append(true)
        .open(&arquivo)
        .and_then(|mut f| f.write_all(line.as_bytes()))
        .is_ok()
}

fn extrair(raw: &str, chave: &str) -> Option<String> {
    let re = match chave {
        "agent_id" => {
            static RE: OnceLock<Regex> = OnceLock::new();
            RE.get_or_init(|| Regex::new(r#""agent_id"\s*:\s*"([^"\\]{1,64})""#).unwrap())
        }
        "agent_type" => {
            static RE: OnceLock<Regex> = OnceLock::new();
            RE.get_or_init(|| Regex::new(r#""agent_type"\s*:\s*"([^"\\]{1,64})""#).unwrap())
        }
        "session_id" => {
            static RE: OnceLock<Regex> = OnceLock::new();
            RE.get_or_init(|| Regex::new(r#""session_id"\s*:\s*"([^"\\]{1,64})""#).unwrap())
        }
        "tool_name" => {
            static RE: OnceLock<Regex> = OnceLock::new();
            RE.get_or_init(|| Regex::new(r#""tool_name"\s*:\s*"([^"\\]{1,64})""#).unwrap())
        }
        _ => return None,
    };
    re.captures(raw).map(|c| c[1].to_string())
}

pub fn registrar_falha(raw: &str, erro: &str) -> bool {
    let Some(agent_id) = extrair(raw, "agent_id") else {
        return false;
    };
    let mut obj = Map::new();
    obj.insert("agent_id".into(), json!(agent_id));
    if let Some(v) = extrair(raw, "agent_type") {
        obj.insert("agent_type".into(), json!(v));
    }
    if let Some(v) = extrair(raw, "session_id") {
        obj.insert("session_id".into(), json!(v));
    }
    if let Some(v) = extrair(raw, "tool_name") {
        obj.insert("tool_name".into(), json!(v));
    }
    registrar(
        &Value::Object(obj),
        Some(AuditExtra {
            bloqueado: false,
            motivo: None,
            erro: Some(erro),
        }),
    )
}
