use regex::Regex;
use serde_json::Value;
use std::sync::OnceLock;

const INICIO: &str = r"(?i)(?:^|[;&|\n(]|&&)\s*(?:rtk\s+(?:proxy\s+)?)?";
const GIT_OPCOES: &str = r"(?:\s+(?:--no-pager|-C\s+\S+|-c\s+\S+))*";

fn re_git_mut() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(&format!(
            r"{INICIO}git{GIT_OPCOES}\s+(commit|push|reset|clean|rebase|merge|cherry-pick|revert|am|apply|stash|checkout|restore|switch|filter-branch|gc|prune|update-ref|config|remote)\b"
        ))
        .unwrap()
    })
}

fn re_git_ref() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(&format!(
            r"{INICIO}git{GIT_OPCOES}\s+(branch\s+(?:-\S*[dDmM]\S*|--delete|--move)|tag\s+(?:-\S*d\S*|--delete)|reflog\s+(?:expire|delete))\b"
        ))
        .unwrap()
    })
}

fn re_remove() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(&format!(
            r"{INICIO}(rm|rmdir|del|erase|rd|remove-item|ri|unlink|shred)\b"
        ))
        .unwrap()
    })
}

fn re_find() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)\bfind\b[^;&|\n]*\s-(delete|exec|execdir)\b").unwrap())
}

fn re_gh() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(&format!(
            r"{INICIO}gh\s+(pr\s+(create|merge|close|edit|comment|review|ready)|issue\s+(create|close|edit|comment|delete)|release\b|repo\s+(create|delete|edit|rename)|api\b[^;&|\n]*(-X|--method)\s*(POST|PUT|PATCH|DELETE))"
        ))
        .unwrap()
    })
}

fn re_publish() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(&format!(r"{INICIO}(npm|pnpm|yarn)\s+publish\b")).unwrap())
}

fn re_shell_wrapper() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(&format!(
            r"{INICIO}(bash|sh|zsh|cmd|powershell|pwsh)(?:\.exe)?\b[^;&|\n]*\s(-c|-command|-encodedcommand|/c)\b"
        ))
        .unwrap()
    })
}

fn re_eval() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(&format!(r"{INICIO}(eval|invoke-expression|iex)\b")).unwrap())
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
        return Some("empty or missing command".to_string());
    };
    if cmd.trim().is_empty() {
        return Some("empty or missing command".to_string());
    }

    let lower = cmd.to_ascii_lowercase();

    if lower.contains("git") {
        if let Some(m) = re_git_mut().captures(cmd) {
            return Some(format!(
                "Matched the git {} rule for commands that can change Git history, local state, or remotes.",
                &m[1]
            ));
        }
        if lower.contains("branch") || lower.contains("tag") || lower.contains("reflog") {
            if let Some(m) = re_git_ref().captures(cmd) {
                let sub = m[1].split_whitespace().next().unwrap_or("");
                return Some(format!("git {sub} deletes or moves a reference"));
            }
        }
    }

    if lower.contains("rm")
        || lower.contains("del")
        || lower.contains("erase")
        || lower.contains("rd")
        || lower.contains("remove-item")
        || lower.contains("ri")
        || lower.contains("unlink")
        || lower.contains("shred")
    {
        if let Some(m) = re_remove().captures(cmd) {
            return Some(format!("{} removes a file or directory", &m[1]));
        }
    }

    if lower.contains("find") && re_find().is_match(cmd) {
        return Some("find with a delete/execute action".to_string());
    }

    if lower.contains("gh") && re_gh().is_match(cmd) {
        return Some("gh performs a remote write".to_string());
    }

    if lower.contains("publish") && re_publish().is_match(cmd) {
        return Some("publish is a remote write".to_string());
    }

    if (lower.contains("sh") || lower.contains("cmd") || lower.contains("powershell"))
        && re_shell_wrapper().is_match(cmd)
    {
        return Some("shell wrapper hides the actual command".to_string());
    }

    if (lower.contains("eval") || lower.contains("invoke-expression") || lower.contains("iex"))
        && re_eval().is_match(cmd)
    {
        return Some("eval/Invoke-Expression hides the actual command".to_string());
    }

    None
}
