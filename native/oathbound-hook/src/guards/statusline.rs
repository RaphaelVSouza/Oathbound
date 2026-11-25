use regex::Regex;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

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

fn re_effort_suffix() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)\s*\((Low|Medium|High|XHigh|Max)\)\s*$").unwrap())
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

fn color_by_pct(pct: i64) -> &'static str {
    if pct <= 15 {
        RED
    } else if pct <= 40 {
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

fn label(value: &str) -> String {
    value.chars().filter(|c| !c.is_control()).collect()
}

fn percent(value: f64) -> i64 {
    value.clamp(0.0, 100.0).round() as i64
}

fn color_percent(prefix: &str, remaining: i64) -> String {
    let color = color_by_pct(remaining);
    format!("{prefix} {color}{remaining}% left{RESET}")
}

fn quota<const N: usize>(
    agy: &Value,
    keys: [&str; N],
    claude: Option<&Value>,
    now: f64,
) -> Option<(i64, Option<f64>)> {
    let agy_quota = keys
        .into_iter()
        .filter_map(|key| agy.get(key))
        .find_map(|bucket| {
            if bucket.get("disabled").and_then(Value::as_bool) == Some(true) {
                return None;
            }
            let remaining = get_f64(bucket, "remaining_fraction")?;
            Some((
                percent(remaining * 100.0),
                get_f64(bucket, "reset_in_seconds"),
            ))
        });
    if agy_quota.is_some() {
        return agy_quota;
    }

    let bucket = claude?;
    let reset = get_f64(bucket, "resets_at").map(|at| at - now);
    if reset.is_some_and(|seconds| seconds <= 0.0) {
        return None;
    }
    Some((percent(100.0 - get_f64(bucket, "used_percentage")?), reset))
}

#[derive(Clone, Copy, PartialEq, Debug)]
enum IconSet {
    Unicode,
    Nerd,
    Oathbound,
    Ascii,
}

impl IconSet {
    fn parse(value: Option<&str>) -> Self {
        match value.map(|v| v.trim().to_ascii_lowercase()).as_deref() {
            Some("nerd") => Self::Nerd,
            Some("oathbound") => Self::Oathbound,
            Some("ascii") => Self::Ascii,
            _ => Self::Unicode,
        }
    }

    fn from_env() -> Self {
        Self::parse(std::env::var("OATHBOUND_STATUSLINE_ICONS").ok().as_deref())
    }

    fn brand(self) -> &'static str {
        match self {
            Self::Unicode => "◆",
            Self::Nerd => "\u{f219}",
            Self::Oathbound => "\u{ef00}",
            Self::Ascii => "*",
        }
    }
}

fn agent_glyph(set: IconSet, role: &str) -> &'static str {
    let role = role.rsplit(':').next().unwrap_or(role);
    // Unicode: BMP symbols any fallback font covers. Nerd: Font Awesome codepoints, stable across
    // Nerd Fonts v2/v3. Oathbound: PUA slots of assets/glyphs/OathboundIcons.ttf.
    let table: [&'static str; 8] = match set {
        IconSet::Unicode => ["⚒", "◇", "✎", "⚡", "✓", "⬟", "⌖", "•"],
        IconSet::Nerd => [
            "\u{f0e3}", "\u{f02d}", "\u{f040}", "\u{f0e7}", "\u{f24e}", "\u{f132}", "\u{f14e}",
            "\u{f219}",
        ],
        IconSet::Oathbound => [
            "\u{ef04}", "\u{ef02}", "\u{ef03}", "\u{ef07}", "\u{ef05}", "\u{ef06}", "\u{ef01}",
            "\u{ef00}",
        ],
        IconSet::Ascii => [">"; 8],
    };
    let index = match role {
        "smith" => 0,
        "scholar" => 1,
        "scribe" => 2,
        "breaker" => 3,
        "assayer" => 4,
        "sentinel" => 5,
        "scout" => 6,
        _ => 7,
    };
    table[index]
}

fn status_width(parts: &[String]) -> usize {
    static ANSI: OnceLock<Regex> = OnceLock::new();
    let ansi = ANSI.get_or_init(|| Regex::new(r"\x1b\[[0-9;]*m").unwrap());
    let mut visible = parts.iter().filter(|part| !part.is_empty()).peekable();
    let mut width = 0;
    while let Some(part) = visible.next() {
        // Budget two cells for non-ASCII characters to leave room for wide glyphs.
        width += ansi
            .replace_all(part, "")
            .chars()
            .map(|c| if c.is_ascii() { 1 } else { 2 })
            .sum::<usize>();
        if visible.peek().is_some() {
            width += 3;
        }
    }
    width
}

pub fn run(raw: &str, oversized: bool) -> String {
    if oversized {
        return String::new();
    }
    let Ok(p) = serde_json::from_str::<Value>(raw) else {
        return String::new();
    };
    if !p.is_object() {
        return String::new();
    }

    let workspace = p.get("workspace").unwrap_or(&Value::Null);
    let cwd = get_str(workspace, "current_dir")
        .or_else(|| get_str(workspace, "project_dir"))
        .or_else(|| get_str(&p, "cwd"))
        .unwrap_or("");
    let project = get_str(workspace, "project_dir").unwrap_or(cwd);
    let project = Path::new(project)
        .file_name()
        .map(|name| label(&name.to_string_lossy()))
        .unwrap_or_default();
    let vcs = p.get("vcs").unwrap_or(&Value::Null);
    let branch = get_str(vcs, "branch")
        .map(str::to_owned)
        .or_else(|| read_git_branch(cwd))
        .map(|name| label(&name));
    let dirty = vcs.get("dirty").and_then(Value::as_bool) == Some(true);
    let repo = match branch {
        Some(branch) if project.is_empty() => branch,
        Some(branch) => format!("{project} · {branch}"),
        None => project,
    };
    let repo = if repo.is_empty() {
        repo
    } else {
        let marker = if dirty { "*" } else { "" };
        format!("{CYAN}{repo}{marker}{RESET}")
    };

    let model = p.get("model").unwrap_or(&Value::Null);
    let effort = p
        .get("effort")
        .and_then(|effort| get_str(effort, "level"))
        .or_else(|| get_str(model, "effort"))
        .map(label)
        .filter(|effort| !effort.is_empty());
    let model = get_str(model, "display_name")
        .or_else(|| get_str(model, "id"))
        .map(label)
        .filter(|name| !name.is_empty())
        .map(|name| match effort {
            Some(effort) => {
                let name = re_effort_suffix().replace(&name, "");
                format!("{MAGENTA}{name}{RESET}{DIM} ({effort}){RESET}")
            }
            None => format!("{MAGENTA}{name}{RESET}"),
        })
        .unwrap_or_default();

    let context = p.get("context_window").unwrap_or(&Value::Null);
    let remaining = get_f64(context, "remaining_percentage")
        .or_else(|| get_f64(context, "used_percentage").map(|used| 100.0 - used))
        .map(percent);
    let context = remaining
        .map(|remaining| color_percent("ctx", remaining))
        .unwrap_or_default();
    let compact = if remaining.is_some_and(|remaining| remaining <= 15) {
        format!("{YELLOW}/compact{RESET}")
    } else {
        String::new()
    };

    let agy = p.get("quota").unwrap_or(&Value::Null);
    let claude = p.get("rate_limits").unwrap_or(&Value::Null);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0.0, |duration| duration.as_secs_f64());
    let primary = quota(agy, ["gemini-5h", "3p-5h"], claude.get("five_hour"), now);
    let weekly = quota(
        agy,
        ["gemini-argon-wtu-weekly", "gemini-weekly", "3p-weekly"],
        claude.get("seven_day"),
        now,
    );
    let primary_label = primary
        .map(|(remaining, _)| color_percent("5h", remaining))
        .unwrap_or_default();
    let reset = fmt_duration(primary.and_then(|(_, reset)| reset));
    let primary = if reset.is_empty() {
        primary_label.clone()
    } else {
        format!("{primary_label}{DIM} ({reset}){RESET}")
    };
    let weekly = weekly
        .map(|(remaining, _)| color_percent("wk", remaining))
        .unwrap_or_default();

    let icons = IconSet::from_env();
    let running: Vec<String> = p
        .get("subagents")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|agent| get_str(agent, "status") == Some("running"))
        .map(|agent| {
            let role = get_str(agent, "role").filter(|role| !role.is_empty());
            let name = get_str(agent, "name").filter(|name| !name.is_empty());
            let display = label(role.or(name).unwrap_or("subagent"));
            format!("{} {display}", agent_glyph(icons, role.or(name).unwrap_or("")))
        })
        .collect();
    let agent_label = |count: usize| {
        let mut names = running[..count].join(" · ");
        let hidden = running.len() - count;
        if hidden > 0 {
            if !names.is_empty() {
                names.push(' ');
            }
            names.push_str(&format!("+{hidden}"));
        }
        if names.is_empty() {
            names
        } else {
            format!("{BLUE}{names}{RESET}")
        }
    };

    const BRAND: usize = 0;
    const REPO: usize = 1;
    const MODEL: usize = 2;
    const CONTEXT: usize = 3;
    const PRIMARY: usize = 4;
    const WEEKLY: usize = 5;
    const COMPACT: usize = 6;
    const AGENTS: usize = 7;
    let mut parts = [
        format!("{BOLD}{} Oathbound{RESET}", icons.brand()),
        repo,
        model,
        context,
        primary,
        weekly,
        compact,
        agent_label(running.len()),
    ];
    if let Some(width) = p
        .get("terminal_width")
        .and_then(Value::as_u64)
        .filter(|w| *w > 0)
    {
        let width = width as usize;
        if status_width(&parts) > width && !parts[PRIMARY].is_empty() {
            parts[PRIMARY] = primary_label;
        }
        if status_width(&parts) > width && !parts[PRIMARY].is_empty() {
            parts[WEEKLY].clear();
        }
        if !running.is_empty() && status_width(&parts) > width {
            parts[AGENTS] = agent_label(0);
            for count in 1..running.len() {
                let previous = std::mem::replace(&mut parts[AGENTS], agent_label(count));
                if status_width(&parts) > width {
                    parts[AGENTS] = previous;
                    break;
                }
            }
        }
        for index in [
            COMPACT, AGENTS, BRAND, REPO, MODEL, WEEKLY, PRIMARY, CONTEXT,
        ] {
            if status_width(&parts) <= width {
                break;
            }
            parts[index].clear();
        }
    }

    parts
        .iter()
        .filter(|part| !part.is_empty())
        .map(String::as_str)
        .collect::<Vec<_>>()
        .join(&format!(" {DIM}|{RESET} "))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn narrow_terminals_keep_metrics_and_count_hidden_agents() {
        let payload = json!({
            "terminal_width": 56,
            "model": { "display_name": "Gemini" },
            "context_window": { "remaining_percentage": 70 },
            "quota": {
                "gemini-5h": { "disabled": true, "remaining_fraction": 0.5 },
                "3p-5h": { "remaining_fraction": 0.8, "reset_in_seconds": 3600 },
                "gemini-weekly": { "remaining_fraction": 0.6 }
            },
            "subagents": [
                { "name": "Long generated name", "role": "smith", "status": "running" },
                { "name": "Second agent", "role": "scholar", "status": "running" }
            ]
        });
        let output = run(&payload.to_string(), false);
        assert!(output.contains("70% left"));
        assert!(output.contains("80% left"));
        assert!(output.contains("+2"));
        assert!(!output.contains("wk"));
        assert!(status_width(&[output]) <= 56);
    }

    #[test]
    fn missing_data_and_controls_do_not_produce_fake_metrics() {
        let payload = json!({
            "model": { "display_name": "Opus\n" },
            "context_window": { "remaining_percentage": null },
            "rate_limits": { "five_hour": { "used_percentage": 16, "resets_at": 1 } }
        });
        let output = run(&payload.to_string(), false);
        assert!(output.contains("Opus"));
        assert!(!output.contains('\n'));
        assert!(!output.contains("ctx"));
        assert!(!output.contains("5h"));
        assert!(run("invalid", false).is_empty());
        assert!(run("{}", true).is_empty());
    }

    #[test]
    fn icon_sets_select_glyphs_and_default_to_unicode() {
        assert_eq!(IconSet::parse(None), IconSet::Unicode);
        assert_eq!(IconSet::parse(Some("bogus")), IconSet::Unicode);
        assert_eq!(IconSet::parse(Some(" Nerd ")), IconSet::Nerd);
        assert_eq!(agent_glyph(IconSet::Unicode, "oathbound:smith"), "⚒");
        assert_eq!(agent_glyph(IconSet::Nerd, "smith"), "\u{f0e3}");
        assert_eq!(agent_glyph(IconSet::Oathbound, "scout"), "\u{ef01}");
        assert_eq!(agent_glyph(IconSet::Oathbound, "other"), "\u{ef00}");
        assert_eq!(agent_glyph(IconSet::Ascii, "scribe"), ">");
        assert_eq!(IconSet::Oathbound.brand(), "\u{ef00}");
    }
}
