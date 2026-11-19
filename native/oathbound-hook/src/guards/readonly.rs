use regex::Regex;
use std::sync::OnceLock;

const GIT_LEITURA: &[&str] = &[
    "diff", "show", "log", "status", "blame", "ls-files", "ls-tree", "rev-parse",
    "rev-list", "cat-file", "grep", "shortlog", "describe", "diff-tree", "show-ref",
];

const GIT_BRANCH_OK: &[&str] = &[
    "--show-current", "-a", "-r", "-v", "-vv", "--list", "-l", "--contains", "--merged",
    "--no-merged",
];

const COMANDOS_LEITURA: &[&str] = &[
    "rg", "grep", "egrep", "fgrep", "find", "ls", "dir", "tree", "cat", "head", "tail",
    "wc", "uniq", "file", "stat", "basename", "dirname", "realpath", "which", "pwd", "cd",
    "echo", "diff", "sort", "get-childitem", "get-content", "select-string", "test-path",
    "get-item", "measure-object",
];

const RTK_SUBCOMANDOS: &[&str] = &["read", "grep", "ls", "find", "rg", "diff", "tree"];

fn re_find_proibido() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^-(delete|exec|execdir|ok|okdir|fprint\w*|fls)$").unwrap())
}

fn re_git_out() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^--(output|open-files-in-pager)(=|$)").unwrap())
}

fn re_short_o() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^-[a-zA-Z]*o").unwrap())
}

fn re_sort_long() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^--(output|compress-program)(=|$)").unwrap())
}

fn re_output_long() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^--output(=|$)").unwrap())
}

fn re_file_c() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^-[a-zA-Z]*C").unwrap())
}

fn re_rg_pre() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^--pre(=|$)").unwrap())
}

pub fn dividir(cmd: &str) -> Result<Vec<Vec<String>>, String> {
    let chars: Vec<char> = cmd.chars().collect();
    let mut segmentos: Vec<Vec<String>> = Vec::new();
    let mut tokens: Vec<String> = Vec::new();
    let mut atual = String::new();
    let mut tem_token = false;
    let mut aspa: Option<char> = None;

    let fecha_token = |tokens: &mut Vec<String>, atual: &mut String, tem_token: &mut bool| {
        if *tem_token {
            tokens.push(std::mem::take(atual));
        }
        atual.clear();
        *tem_token = false;
    };

    let fecha_segmento = |segmentos: &mut Vec<Vec<String>>,
                          tokens: &mut Vec<String>,
                          atual: &mut String,
                          tem_token: &mut bool| {
        fecha_token(tokens, atual, tem_token);
        if !tokens.is_empty() {
            segmentos.push(std::mem::take(tokens));
        }
    };

    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if let Some(q) = aspa {
            if q == '"' && c == '\\' {
                if i + 1 >= chars.len() {
                    return Err("escape incompleto".to_string());
                }
                i += 1;
                atual.push(chars[i]);
                tem_token = true;
                i += 1;
                continue;
            }
            if c == q {
                aspa = None;
                i += 1;
                continue;
            }
            if q == '"' && (c == '`' || (c == '$' && chars.get(i + 1) == Some(&'('))) {
                return Err("substituição de comando".to_string());
            }
            atual.push(c);
            tem_token = true;
            i += 1;
            continue;
        }
        if c == '\\' {
            if i + 1 >= chars.len() {
                return Err("escape incompleto".to_string());
            }
            i += 1;
            atual.push(chars[i]);
            tem_token = true;
            i += 1;
            continue;
        }
        if c == '\'' || c == '"' {
            aspa = Some(c);
            tem_token = true;
            i += 1;
            continue;
        }
        if c == '`' || (c == '$' && chars.get(i + 1) == Some(&'(')) {
            return Err("substituição de comando".to_string());
        }
        if c == '>' || c == '<' {
            return Err("redirecionamento".to_string());
        }
        if c == ';' || c == '|' || c == '&' || c == '\n' || c == '\r' {
            fecha_segmento(&mut segmentos, &mut tokens, &mut atual, &mut tem_token);
            i += 1;
            continue;
        }
        if c == ' ' || c == '\t' {
            fecha_token(&mut tokens, &mut atual, &mut tem_token);
            i += 1;
            continue;
        }
        atual.push(c);
        tem_token = true;
        i += 1;
    }

    if aspa.is_some() {
        return Err("aspas não fechadas".to_string());
    }
    fecha_segmento(&mut segmentos, &mut tokens, &mut atual, &mut tem_token);
    Ok(segmentos)
}

pub fn nome_comando(token: &str) -> String {
    let base = token
        .rsplit_once(['/', '\\'])
        .map(|(_, b)| b)
        .unwrap_or(token);
    let lower = base.to_ascii_lowercase();
    lower.strip_suffix(".exe").unwrap_or(&lower).to_string()
}

fn verifica_segmento(tokens: &[String]) -> Option<String> {
    let mut start = 0;
    let mut via_rtk = false;
    if nome_comando(&tokens[0]) == "rtk" {
        via_rtk = true;
        start += 1;
        if tokens.get(start).map(|s| s.as_str()) == Some("proxy") {
            start += 1;
        }
        if start >= tokens.len() {
            return Some("rtk sem subcomando".to_string());
        }
    }
    if tokens[start].contains('=') {
        return Some("atribuição de variável antes do comando".to_string());
    }
    let cmd = nome_comando(&tokens[start]);
    let args = &tokens[start + 1..];

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
            return Some("git sem subcomando".to_string());
        };
        let resto = &args[i + 1..];
        if sub == "branch" {
            if let Some(ruim) = resto.iter().find(|a| !GIT_BRANCH_OK.contains(&a.as_str())) {
                return Some(format!("git branch com argumento não permitido: {ruim}"));
            }
            return None;
        }
        if !GIT_LEITURA.contains(&sub.as_str()) {
            return Some(format!("git {sub} não é leitura"));
        }
        if let Some(out) = resto
            .iter()
            .find(|a| re_git_out().is_match(a) || a.as_str() == "-o")
        {
            let flag = out.split('=').next().unwrap_or(out);
            return Some(format!("git com {flag} não é permitido"));
        }
        return None;
    }

    if cmd == "find" && args.iter().any(|a| re_find_proibido().is_match(a)) {
        return Some("find com ação de escrita/execução".to_string());
    }
    if cmd == "sort"
        && args
            .iter()
            .any(|a| re_short_o().is_match(a) || re_sort_long().is_match(a))
    {
        return Some("sort com gravação/execução não permitido".to_string());
    }
    if cmd == "tree"
        && args
            .iter()
            .any(|a| re_short_o().is_match(a) || re_output_long().is_match(a))
    {
        return Some("tree -o grava arquivo".to_string());
    }
    if cmd == "file"
        && args
            .iter()
            .any(|a| re_file_c().is_match(a) || a.as_str() == "--compile")
    {
        return Some("file -C grava arquivo".to_string());
    }
    if cmd == "rg" && args.iter().any(|a| re_rg_pre().is_match(a)) {
        return Some("rg --pre executa comando".to_string());
    }
    if cmd == "uniq" {
        let mut apos_double_dash = false;
        let mut posicionais = 0usize;
        let mut j = 0;
        while j < args.len() {
            let a = args[j].as_str();
            if !apos_double_dash && a == "--" {
                apos_double_dash = true;
                j += 1;
                continue;
            }
            if !apos_double_dash && a.starts_with('-') && a != "-" {
                if (a == "-f" || a == "-s" || a == "-w") && j + 1 < args.len() {
                    j += 2;
                    continue;
                }
                j += 1;
                continue;
            }
            posicionais += 1;
            if posicionais > 1 {
                return Some("uniq com arquivo de saída".to_string());
            }
            j += 1;
        }
    }

    if via_rtk && RTK_SUBCOMANDOS.contains(&cmd.as_str()) {
        return None;
    }
    if COMANDOS_LEITURA.contains(&cmd.as_str()) {
        return None;
    }
    Some(format!("comando fora da lista de leitura: {cmd}"))
}

pub fn avaliar(command: Option<&str>) -> Option<String> {
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
    if segmentos.is_empty() {
        return Some("comando vazio".to_string());
    }
    for seg in &segmentos {
        if let Some(motivo) = verifica_segmento(seg) {
            return Some(motivo);
        }
    }
    None
}
