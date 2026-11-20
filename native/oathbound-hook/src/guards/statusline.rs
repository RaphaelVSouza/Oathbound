use regex::Regex;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

const RESET: &str = "\x1b[0m";
const DIM: &str = "\x1b[2m";
const BOLD: &str = "\x1b[1m";
const CYAN: &str = "\x1b[36m";
const GREEN: &str = "\x1b[32m";
const YELLOW: &str = "\x1b[33m";
const RED: &str = "\x1b[31m";
const MAGENTA: &str = "\x1b[35m";
const BLUE: &str = "\x1b[34m";

fn re_gitdir() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)^gitdir:\s*(.+)$").unwrap())
}

fn re_gemini_prefix() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)^Gemini\s+").unwrap())
}

fn re_effort_suffix() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)\s*\((Low|Medium|High|Max)\)\s*$").unwrap())
}

fn fmt_tokens(n: Option<f64>) -> String {
    let n = match n {
        Some(v) if v.is_finite() && v >= 0.0 => v,
        _ => return "0".to_string(),
    };
    if n >= 1e6 {
        let s = if n >= 10e6 {
            format!("{:.0}", n / 1e6)
        } else {
            format!("{:.1}", n / 1e6)
        };
        format!("{}M", s.strip_suffix(".0").unwrap_or(&s))
    } else if n >= 1e3 {
        let s = if n >= 100e3 {
            format!("{:.0}", n / 1e3)
        } else {
            format!("{:.1}", n / 1e3)
        };
        format!("{}k", s.strip_suffix(".0").unwrap_or(&s))
    } else {
        format!("{}", n.round() as i64)
    }
}

fn fmt_duration(sec: Option<f64>) -> String {
    let sec = match sec {
        Some(v) if v.is_finite() && v > 0.0 => v,
        _ => return String::new(),
    };
    let h = (sec / 3600.0).floor() as i64;
    let m = ((sec % 3600.0) / 60.0).floor() as i64;
    if h >= 24 {
        let d = h / 24;
        let rem_h = h % 24;
        if rem_h > 0 {
            format!("{}d{}h", d, rem_h)
        } else {
            format!("{}d", d)
        }
    } else if h > 0 {
        if m > 0 {
            format!("{}h{:02}m", h, m)
        } else {
            format!("{}h", h)
        }
    } else {
        format!("{}m", m)
    }
}

fn color_by_pct(pct: i64, invert: bool) -> &'static str {
    let val = if invert { 100 - pct } else { pct };
    if val <= 15 {
        RED
    } else if val <= 40 {
        YELLOW
    } else {
        GREEN
    }
}

fn read_git_branch(start_dir: &str) -> Option<String> {
    if start_dir.is_empty() {
        return None;
    }
    let mut dir = PathBuf::from(start_dir);
    for _ in 0..6 {
        let dot_git = dir.join(".git");
        if let Ok(meta) = fs::metadata(&dot_git) {
            let mut head_path = dot_git.join("HEAD");
            if meta.is_file() {
                if let Ok(content) = fs::read_to_string(&dot_git) {
                    let trimmed = content.trim();
                    if let Some(caps) = re_gitdir().captures(trimmed) {
                        if let Some(m) = caps.get(1) {
                            head_path = dir.join(m.as_str().trim()).join("HEAD");
                        }
                    }
                }
            }
            if let Ok(head) = fs::read_to_string(&head_path) {
                let head = head.trim();
                if let Some(branch) = head.strip_prefix("ref: refs/heads/") {
                    return Some(branch.to_string());
                }
                let short: String = head.chars().take(7).collect();
                return Some(short);
            }
        }
        match dir.parent() {
            Some(p) if p != dir => dir = p.to_path_buf(),
            _ => break,
        }
    }
    None
}

fn get_f64(v: &Value, key: &str) -> Option<f64> {
    v.get(key).and_then(|x| x.as_f64())
}

fn get_str<'a>(v: &'a Value, key: &str) -> Option<&'a str> {
    v.get(key).and_then(|x| x.as_str())
}

pub fn run(raw: &str, oversized: bool) -> String {
    let p: Value = if oversized {
        Value::Object(serde_json::Map::new())
    } else {
        serde_json::from_str(raw).unwrap_or_else(|_| Value::Object(serde_json::Map::new()))
    };

    let mut parts: Vec<String> = Vec::new();

    // 1. Project + Git Branch
    let cwd = p
        .get("workspace")
        .and_then(|w| get_str(w, "current_dir").or_else(|| get_str(w, "project_dir")))
        .or_else(|| get_str(&p, "cwd"))
        .unwrap_or("");
    let project = if cwd.is_empty() {
        String::new()
    } else {
        Path::new(cwd)
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default()
    };
    let branch = p
        .get("vcs")
        .and_then(|v| get_str(v, "branch"))
        .map(|s| s.to_string())
        .or_else(|| read_git_branch(cwd));

    if !project.is_empty() || branch.is_some() {
        let dirty = if p
            .get("vcs")
            .and_then(|v| v.get("dirty"))
            .and_then(|b| b.as_bool())
            .unwrap_or(false)
        {
            "*"
        } else {
            ""
        };
        let repo_label = match (&project.is_empty(), &branch) {
            (false, Some(b)) => format!(
                "{}{}{}{} {}({}{}){}",
                BOLD, CYAN, project, RESET, CYAN, b, dirty, RESET
            ),
            (_, Some(b)) => format!("{}{}{}{}", CYAN, b, dirty, RESET),
            (false, None) => format!("{}{}{}{}", CYAN, project, dirty, RESET),
            (true, None) => String::new(),
        };
        if !repo_label.is_empty() {
            parts.push(repo_label);
        }
    }

    // 2. Model + Effort
    if let Some(model) = p.get("model") {
        let raw_name = get_str(model, "display_name").or_else(|| get_str(model, "id"));
        if let Some(name) = raw_name {
            if !name.is_empty() {
                let s1 = re_gemini_prefix().replace(name, "");
                let model_name = re_effort_suffix().replace(&s1, "");
                let effort = match get_str(model, "effort") {
                    Some(e) if !e.is_empty() => format!("{}/{}{}", DIM, e, RESET),
                    _ => String::new(),
                };
                parts.push(format!("{}{}{}{}", MAGENTA, model_name, RESET, effort));
            }
        }
    }

    // 3. Context Window
    if let Some(cw) = p.get("context_window").filter(|v| v.is_object()) {
        let used_pct = get_f64(cw, "used_percentage").map(|v| v.round() as i64);
        let u = cw.get("current_usage");
        let input_tokens = u.and_then(|x| get_f64(x, "input_tokens")).unwrap_or(0.0);
        let cache_tokens = u
            .and_then(|x| get_f64(x, "cache_read_input_tokens"))
            .unwrap_or(0.0);
        let output_tokens = u.and_then(|x| get_f64(x, "output_tokens")).unwrap_or(0.0);
        let cur_tokens = input_tokens + cache_tokens + output_tokens;
        let max_tokens = get_f64(cw, "context_window_size").unwrap_or(0.0);
        let ctx_color = match used_pct {
            Some(pct) => color_by_pct(pct, true),
            None => YELLOW,
        };

        let mut ctx_text = if cur_tokens > 0.0 && max_tokens > 0.0 {
            let mut s = format!("ctx {}", fmt_tokens(Some(cur_tokens)));
            if let Some(pct) = used_pct {
                s.push_str(&format!(" ({}%)", pct));
            }
            s
        } else if let Some(pct) = used_pct {
            format!("ctx {}%", pct)
        } else {
            format!(
                "{} in / {} out",
                fmt_tokens(get_f64(cw, "total_input_tokens")),
                fmt_tokens(get_f64(cw, "total_output_tokens"))
            )
        };

        let total_prompt = input_tokens + cache_tokens;
        if total_prompt > 1000.0 {
            let cache_pct = ((cache_tokens / total_prompt) * 100.0).round() as i64;
            let cache_col = if cache_pct >= 75 {
                GREEN
            } else if cache_pct >= 40 {
                YELLOW
            } else {
                DIM
            };
            ctx_text.push_str(&format!(
                " {}[{}{}cache {}%{}{}{}]{}",
                DIM, RESET, cache_col, cache_pct, RESET, DIM, "", RESET
            ));
        }

        if let Some(pct) = used_pct {
            if pct >= 50 {
                ctx_text.push_str(&format!(" {}{}⚠ /compact{}", BOLD, RED, RESET));
            }
        }

        parts.push(format!("{}{}{}", ctx_color, ctx_text, RESET));
    }

    // 4. Quota (5h + weekly windows)
    if let Some(quota) = p.get("quota").filter(|v| v.is_object()) {
        let q5h = quota.get("gemini-5h").or_else(|| quota.get("3p-5h"));
        let qwk = quota
            .get("gemini-argon-wtu-weekly")
            .or_else(|| quota.get("gemini-weekly"))
            .or_else(|| quota.get("3p-weekly"));
        let mut q_parts: Vec<String> = Vec::new();

        if let Some(q) = q5h {
            if let Some(rem) = get_f64(q, "remaining_fraction") {
                let pct = (rem * 100.0).round() as i64;
                let col = color_by_pct(pct, false);
                let rst = fmt_duration(get_f64(q, "reset_in_seconds"));
                let rst_fmt = if rst.is_empty() {
                    String::new()
                } else {
                    format!("{}({}){}", DIM, rst, RESET)
                };
                q_parts.push(format!("5h:{}{}%{}{}", col, pct, RESET, rst_fmt));
            }
        }
        if let Some(q) = qwk {
            if let Some(rem) = get_f64(q, "remaining_fraction") {
                let pct = (rem * 100.0).round() as i64;
                let col = color_by_pct(pct, false);
                q_parts.push(format!("wk:{}{}%{}", col, pct, RESET));
            }
        }
        if !q_parts.is_empty() {
            parts.push(q_parts.join(" "));
        }
    }

    // 5. Active subagents
    if let Some(subs) = p.get("subagents").and_then(|v| v.as_array()) {
        let running: Vec<&str> = subs
            .iter()
            .filter(|s| get_str(s, "status") == Some("running"))
            .map(|s| get_str(s, "name").unwrap_or("subagent"))
            .collect();
        if !running.is_empty() {
            parts.push(format!(
                "{}⚡ {} sub ({}){}",
                BLUE,
                running.len(),
                running.join(","),
                RESET
            ));
        }
    }

    parts.join(&format!(" {}|{} ", DIM, RESET))
}
