'use strict';

// Auditor estático de documentação portável. Requer Node >= 24.
// Sem dependências externas.

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { createSource } = require('./audit-docs.sources.ts');

// ---------------------------------------------------------------------------
// Utilitários Puros
// ---------------------------------------------------------------------------

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function toLines(buf) {
  let text = buf.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text.replace(/\r\n?/g, '\n').split('\n');
}

function classifyLines(lines) {
  const info = new Array(lines.length);
  let fence = null;
  let inComment = false;
  let start = 0;

  if (lines[0] !== undefined && /^---\s*$/.test(lines[0])) {
    for (let j = 1; j < lines.length; j++) {
      if (/^(---|\.\.\.)\s*$/.test(lines[j])) {
        for (let k = 0; k <= j; k++) info[k] = { skip: true, fence: false };
        start = j + 1;
        break;
      }
    }
  }

  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (fence) {
      const close = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (close && close[1][0] === fence.char && close[1].length >= fence.len) fence = null;
      info[i] = { skip: true, fence: true };
      continue;
    }
    const open = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (open && !inComment && !(open[1][0] === '`' && open[2].indexOf('`') !== -1)) {
      fence = { char: open[1][0], len: open[1].length };
      info[i] = { skip: true, fence: true };
      continue;
    }
    let visible = '';
    let rest = line;
    while (rest.length > 0) {
      if (inComment) {
        const end = rest.indexOf('-->');
        if (end === -1) { rest = ''; break; }
        rest = rest.slice(end + 3);
        inComment = false;
      } else {
        const begin = rest.indexOf('<!--');
        if (begin === -1) { visible += rest; rest = ''; break; }
        visible += rest.slice(0, begin);
        rest = rest.slice(begin + 4);
        inComment = true;
      }
    }
    info[i] = { skip: false, fence: false, visible: visible };
  }
  return info;
}

function stripCodeSpans(line) {
  return line.replace(/(`+)(?:(?!\1)[\s\S])*?[^`]\1(?!`)|(`+)\2(?!`)/g, ' ');
}

function stripInlineMarkdown(text) {
  return text
    .replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, '$2')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/<[^>]+>/g, '');
}

function slugify(text) {
  return stripInlineMarkdown(text)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-');
}

function splitTableCells(line) {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
  const cells = [];
  let cur = '';
  let tick = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '\\' && t[i + 1] === '|') { cur += '|'; i++; continue; }
    if (c === '`') {
      let n = 1;
      while (t[i + n] === '`') n++;
      if (tick === 0) tick = n; else if (tick === n) tick = 0;
      cur += t.slice(i, i + n);
      i += n - 1;
      continue;
    }
    if (c === '|' && tick === 0) { cells.push(cur); cur = ''; continue; }
    cur += c;
  }
  cells.push(cur);
  return cells;
}

function isDelimiterRow(line) {
  if (line.indexOf('-') === -1) return false;
  const cells = splitTableCells(line);
  if (cells.length === 0) return false;
  if (cells.length === 1 && line.indexOf('|') === -1) return false;
  return cells.every(c => /^\s*:?-+:?\s*$/.test(c));
}

function extractLinkDestinations(line) {
  const dests = [];
  const refDef = line.match(/^ {0,3}\[([^\]]+)\]:[ \t]*(<[^>]*>|\S+)/);
  if (refDef && refDef[1][0] !== '^') {
    dests.push(refDef[2]);
    return dests;
  }
  let pos = 0;
  while (true) {
    const idx = line.indexOf('](', pos);
    if (idx === -1) break;
    if (line.lastIndexOf('[', idx) === -1) { pos = idx + 2; continue; }
    let j = idx + 2;
    while (j < line.length && line[j] === ' ') j++;
    let dest = '';
    if (line[j] === '<') {
      const end = line.indexOf('>', j + 1);
      if (end === -1) { pos = idx + 2; continue; }
      dest = line.slice(j + 1, end);
      j = end + 1;
    } else {
      let depth = 0;
      const startJ = j;
      while (j < line.length) {
        const c = line[j];
        if (c === '\\' && j + 1 < line.length) { j += 2; continue; }
        if (c === '(') depth++;
        else if (c === ')') {
          if (depth === 0) break;
          depth--;
        } else if (c === ' ' || c === '\t') break;
        j++;
      }
      dest = line.slice(startJ, j);
    }
    if (dest !== '') dests.push(dest);
    pos = j;
  }
  return dests;
}

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch (e) {
    return s;
  }
}

function symbolPattern(sym) {
  const n = escapeRegex(sym.name);
  switch (sym.kind) {
    case 'var-function':
      return new RegExp('^\\s*var\\s+' + n + '\\s*=\\s*function\\b');
    case 'function':
      return new RegExp('^\\s*(?:async\\s+)?function\\s+' + n + '\\s*[<(]');
    case 'prototype':
      return new RegExp('^\\s*\\w+\\.prototype\\.' + n + '\\s*=\\s*function\\b');
    case 'backbone-extend':
      return new RegExp('^\\s*var\\s+' + n + '\\s*=\\s*[\\w.]+\\.extend\\(\\s*\\{');
    case 'export-function':
      return new RegExp('^\\s*export\\s+(?:async\\s+)?function\\s+' + n + '\\b');
    case 'export-default-function':
      return new RegExp('^\\s*export\\s+default\\s+(?:async\\s+)?function\\s+' + n + '\\s*[<(]');
    case 'export-class':
      return new RegExp('^\\s*export\\s+(?:default\\s+)?(?:abstract\\s+)?class\\s+' + n + '\\b');
    case 'alias':
      return new RegExp('^\\s*export\\s+(?:const|let|var)?\\s*\\{[^}]*\\b' + n + '\\b[^}]*\\}');
    case 'interface':
      return new RegExp('^\\s*(?:export\\s+)?interface\\s+' + n + '\\b');
    case 'type':
      return new RegExp('^\\s*(?:export\\s+)?type\\s+' + n + '\\s*=');
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Motor Profundo de Auditoria
// ---------------------------------------------------------------------------

const SEVERITIES = ['error', 'warn', 'off'];
const DEFAULT_CHECKS = {
  anchors: 'warn',      // fragmento #ancora sem cabeçalho/id correspondente
  portability: 'warn',  // caixa divergente ou barra invertida em link
  outsideRepo: 'warn'   // link relativo que sai da raiz do repositório
};
const DEFAULT_LINE_REF_EXTENSIONS = ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'cs', 'vb', 'html',
  'aspx', 'ascx', 'cshtml', 'astro', 'scss', 'css', 'json'];

/**
 * Executa auditoria estática completa sobre documentos e contratos.
 * @param {object} [opts]
 * @param {string} [opts.repoRoot] Raiz do repositório (padrão: diretório atual).
 * @param {object} [opts.config] Objeto de configuração fornecido diretamente.
 * @param {string} [opts.configPath] Caminho para arquivo de configuração caso opts.config não seja fornecido.
 * @param {object} [opts.source] Fonte de leitura personalizada (AuditSource).
 * @param {boolean} [opts.staged] Auditoria no índice Git.
 * @param {boolean} [opts.verbose] Modo verboso.
 * @returns {{ errors: string[], warnings: string[], stats: { mdFiles: number, sourceFiles: number, ignoredCount: number, errors: number, warnings: number, sourceLabel: string, nothingToAudit?: boolean } }}
 */
function auditDocs(opts = {}) {
  const repoRoot = path.resolve(opts.repoRoot || '.');
  if (!fs.existsSync(repoRoot) || !fs.statSync(repoRoot).isDirectory()) {
    throw Error('raiz do projeto não encontrada: ' + repoRoot);
  }

  let config = opts.config;
  if (!config) {
    const configPath = path.resolve(opts.configPath || path.join(repoRoot, 'tools', 'audit-docs.config.js'));
    if (!fs.existsSync(configPath)) {
      throw Error('configuração não encontrada: ' + configPath);
    }
    config = require(configPath);
  }

  const checks = Object.assign({}, DEFAULT_CHECKS, config.checks || {});
  for (const key of Object.keys(checks)) {
    if (SEVERITIES.indexOf(checks[key]) === -1) {
      throw Error("checks." + key + " inválido: '" + checks[key] + "' (use error | warn | off)");
    }
  }

  const lineRefExtensions = config.lineRefExtensions || DEFAULT_LINE_REF_EXTENSIONS;
  const lineRefRegex = new RegExp('\\.(' + lineRefExtensions.map(escapeRegex).join('|') + '):\\d+', 'i');

  const blocklist = config.blocklist || {};
  const blockNames = blocklist.names || [];
  const blockSegments = blocklist.pathSegments || [];
  const blockFilePatterns = blocklist.filePatterns || [];
  const lineRefAllowlist = config.lineRefAllowlist || [];
  const maxBytes = (config.limits && config.limits.maxBytes) || Infinity;

  function gitExec(gitArgs, input) {
    return cp.execFileSync('git', gitArgs, {
      cwd: repoRoot,
      input: input,
      maxBuffer: 512 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe']
    });
  }

  function isBlockedPath(rel) {
    const normalized = '/' + rel.replace(/^\/+|\/+$/g, '') + '/';
    for (const seg of blockSegments) {
      if (normalized.indexOf(seg) !== -1) return true;
    }
    const parts = rel.split('/');
    for (const part of parts) {
      if (blockNames.indexOf(part) !== -1) return true;
    }
    const base = parts[parts.length - 1];
    for (const pattern of blockFilePatterns) {
      if (base.endsWith(pattern)) return true;
    }
    return false;
  }

  if (opts.staged && !opts.source) {
    let shouldRun = false;
    try {
      const out = gitExec(['diff', '--cached', '--name-status', '-z', '--diff-filter=ACMRD']).toString('utf8');
      const tokens = out.split('\0').filter(t => t !== '');
      let i = 0;
      while (i < tokens.length && !shouldRun) {
        const status = tokens[i++];
        const pathCount = (status[0] === 'R' || status[0] === 'C') ? 2 : 1;
        const paths = tokens.slice(i, i + pathCount);
        i += pathCount;
        if (status[0] === 'D' || status[0] === 'R') {
          shouldRun = true;
          break;
        }
        for (const p of paths) {
          if (p.endsWith('.md')) shouldRun = true;
          for (const key of Object.keys(config.targets || {})) {
            const t = config.targets[key];
            if (t.enabled && t.sourceRoot && (p === t.sourceRoot || p.startsWith(t.sourceRoot.replace(/\/+$/, '') + '/'))) {
              shouldRun = true;
            }
          }
        }
      }
    } catch (err) {
      throw Error('erro ao verificar status staged do git: ' + err.message);
    }
    if (!shouldRun) {
      return {
        errors: [],
        warnings: [],
        stats: { mdFiles: 0, sourceFiles: 0, ignoredCount: 0, errors: 0, warnings: 0, sourceLabel: 'índice do git', nothingToAudit: true }
      };
    }
  }

  const source = opts.source || createSource({ staged: !!opts.staged, repoRoot, git: gitExec });
  const errors = [];
  const warnings = [];
  let ignoredCount = 0;

  function report(rel, lineNum, checkId, message, severity) {
    const sev = severity || 'error';
    if (sev === 'off') return;
    const entry = rel + ':' + (lineNum || 1) + ': [' + checkId + '] ' + (sev === 'warn' ? 'aviso: ' : '') + message;
    (sev === 'warn' ? warnings : errors).push(entry);
  }

  const mdFiles = [];
  const seenMd = new Set();

  function pushMd(rel, lineNumberRefs) {
    if (seenMd.has(rel)) return;
    seenMd.add(rel);
    mdFiles.push({ rel: rel, lineNumberRefs: lineNumberRefs });
  }

  for (const docName of (config.rootDocs || [])) {
    const rel = toPosix(docName);
    if (!source.isFile(rel)) continue;
    if (source.size(rel) <= maxBytes) {
      pushMd(rel, 'forbid');
    } else {
      ignoredCount++;
    }
  }

  for (const entry of (config.docs || [])) {
    const base = toPosix(entry.path).replace(/\/+$/, '');
    if (!source.isDir(base)) continue;
    const lineNumberRefs = entry.lineNumberRefs || 'allow';

    const walk = (relDir) => {
      for (const child of source.list(relDir)) {
        const rel = relDir ? relDir + '/' + child.name : child.name;
        if (isBlockedPath(rel)) {
          ignoredCount++;
          continue;
        }
        if (child.isDir) {
          if (entry.recursive) walk(rel);
        } else if (child.isFile) {
          if (child.name.endsWith('.md') && source.size(rel) <= maxBytes) {
            pushMd(rel, lineNumberRefs);
          } else {
            ignoredCount++;
          }
        }
      }
    };
    walk(base);
  }

  const sourceFiles = [];
  for (const targetKey of Object.keys(config.targets || {})) {
    const target = config.targets[targetKey];
    if (!target.enabled) continue;
    const root = toPosix(target.sourceRoot).replace(/\/+$/, '');
    for (const fileName of Object.keys(target.files || {})) {
      const rel = path.posix.normalize(root + '/' + toPosix(fileName));
      if (source.isFile(rel)) {
        if (source.size(rel) <= maxBytes) {
          sourceFiles.push({ targetKey: targetKey, rel: rel, config: target.files[fileName] || {} });
        } else {
          ignoredCount++;
        }
      } else {
        report(rel, 1, 'check3', 'arquivo fonte declarado nao encontrado: ' + rel);
      }
    }
  }

  source.preload(mdFiles.map(d => d.rel).concat(sourceFiles.map(s => s.rel)));

  const anchorCache = new Map();

  function getAnchors(rel) {
    if (anchorCache.has(rel)) return anchorCache.get(rel);
    source.preload([rel]);
    const buf = source.read(rel);
    const lines = toLines(buf);
    const info = classifyLines(lines);
    const anchors = new Set();
    const counts = new Map();

    function addSlug(text) {
      const base = slugify(text);
      const n = counts.get(base) || 0;
      counts.set(base, n + 1);
      anchors.add(n === 0 ? base : base + '-' + n);
    }

    for (let i = 0; i < lines.length; i++) {
      if (info[i].skip) continue;
      const line = info[i].visible;

      const idRe = /\b(?:id|name)\s*=\s*["']([^"']+)["']/gi;
      let m;
      while ((m = idRe.exec(line)) !== null) anchors.add(m[1].toLowerCase());

      const atx = line.match(/^ {0,3}#{1,6}(?:[ \t]+(.*?))?[ \t]*$/);
      if (atx) {
        const text = (atx[1] || '').replace(/(?:^|[ \t]+)#+[ \t]*$/, '');
        addSlug(text);
        continue;
      }
      const next = lines[i + 1];
      if (next !== undefined && info[i + 1] && !info[i + 1].skip &&
          /^ {0,3}(=+|-+)[ \t]*$/.test(next) && line.trim() !== '' &&
          !/^ {0,3}([-*+]|\d+[.)])[ \t]/.test(line) && line.indexOf('|') === -1) {
        addSlug(line);
        i++;
      }
    }
    anchorCache.set(rel, anchors);
    return anchors;
  }

  function checkAnchor(doc, lineNum, targetRel, fragment, dest) {
    if (checks.anchors === 'off') return;
    const anchors = getAnchors(targetRel);
    if (!anchors.has(fragment.toLowerCase())) {
      report(doc.rel, lineNum, 'check1', 'âncora inexistente em ' + targetRel + ': ' + dest, checks.anchors);
    }
  }

  function checkLink(doc, lineNum, destRaw) {
    const dest = destRaw.trim();
    if (/^(?:[A-Za-z]:[\\/]|file:)/i.test(dest) || /^\\\\/.test(dest)) {
      report(doc.rel, lineNum, 'check2', 'caminho absoluto ou protocolo file: em link: ' + dest);
      return;
    }
    if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(dest) || dest.startsWith('//')) return;

    const hashIdx = dest.indexOf('#');
    let pathPart = hashIdx === -1 ? dest : dest.slice(0, hashIdx);
    const fragment = hashIdx === -1 ? '' : safeDecode(dest.slice(hashIdx + 1));
    pathPart = safeDecode(pathPart.split('?')[0]);

    if (pathPart === '') {
      if (fragment) checkAnchor(doc, lineNum, doc.rel, fragment, dest);
      return;
    }

    if (pathPart.startsWith('/')) {
      report(doc.rel, lineNum, 'check2', 'caminho absoluto a partir da raiz; use caminho relativo: ' + dest);
      return;
    }

    if (pathPart.indexOf('\\') !== -1) {
      report(doc.rel, lineNum, 'check1', 'barra invertida em link não funciona fora do Windows; use /: ' + dest, checks.portability);
      pathPart = pathPart.replace(/\\/g, '/');
    }

    let target = path.posix.normalize(path.posix.join(path.posix.dirname(doc.rel), pathPart));
    target = target.replace(/\/+$/, '');
    if (target === '.') target = '';

    if (target === '..' || target.startsWith('../')) {
      report(doc.rel, lineNum, 'check1', 'link sai da raiz do repositório: ' + dest, checks.outsideRepo);
      return;
    }

    if (!source.exists(target)) {
      report(doc.rel, lineNum, 'check1', 'link quebrado para: ' + dest);
      return;
    }

    const exact = source.exactCase(target);
    let actualTarget = target;
    if (!exact.ok) {
      report(doc.rel, lineNum, 'check1', 'caixa divergente (quebra em Linux/GitHub): link aponta para ' + target +
        ', arquivo real é ' + exact.actual + ': ' + dest, checks.portability);
      if (exact.actual) actualTarget = exact.actual;
    }

    if (fragment && actualTarget.toLowerCase().endsWith('.md') && source.isFile(actualTarget)) {
      checkAnchor(doc, lineNum, actualTarget, fragment, dest);
    }
  }

  for (const doc of mdFiles) {
    if (opts.verbose) console.log('[verbose] lendo ' + doc.rel);
    const lines = toLines(source.read(doc.rel));
    const info = classifyLines(lines);
    const enforceLineRefs = doc.lineNumberRefs === 'forbid' && lineRefAllowlist.indexOf(doc.rel) === -1;
    let tableLineCols = null;

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      if (info[i].skip) {
        tableLineCols = null;
        continue;
      }
      const line = lines[i];
      const trimmed = line.trim();

      if (tableLineCols === null) {
        const next = lines[i + 1];
        if (trimmed.indexOf('|') !== -1 && next !== undefined && info[i + 1] && !info[i + 1].skip && isDelimiterRow(next)) {
          tableLineCols = [];
          splitTableCells(line).forEach((cell, idx) => {
            if (/\blinhas?\b|\blines?\b/i.test(cell.trim())) tableLineCols.push(idx);
          });
        }
      } else if (trimmed === '' || trimmed.indexOf('|') === -1) {
        tableLineCols = null;
      } else if (!isDelimiterRow(line) && enforceLineRefs) {
        const cells = splitTableCells(line);
        for (const colIdx of tableLineCols) {
          if (cells[colIdx] && cells[colIdx].trim() !== '') {
            report(doc.rel, lineNum, 'check6', 'coluna de linhas preenchida em tabela: ' + cells[colIdx].trim());
          }
        }
        for (const c of cells) {
          const ct = c.trim();
          if (/^\d+\s*[–—]\s*\d+$/.test(ct)) {
            report(doc.rel, lineNum, 'check6', 'célula contém intervalo de linhas com travessão: ' + ct);
          }
        }
      }

      if (enforceLineRefs) {
        if (/#L\d+/i.test(line)) {
          report(doc.rel, lineNum, 'check6', 'referência a fragmento de linha #L encontrada: ' + trimmed);
        }
        if (lineRefRegex.test(line)) {
          report(doc.rel, lineNum, 'check6', 'referência a arquivo:linha encontrada: ' + trimmed);
        }
      }

      const visible = stripCodeSpans(info[i].visible);
      if ((config.forbiddenTerms?.paths || []).some(p => doc.rel === p || (p.endsWith('/**') && doc.rel.startsWith(p.slice(0, -3) + '/')))) {
        for (const term of config.forbiddenTerms.terms || []) {
          if (new RegExp('\\b' + escapeRegex(term) + '\\b', 'i').test(visible)) {
            report(doc.rel, lineNum, 'check1', 'termo revogado em documento ativo: ' + term);
          }
        }
      }
      for (const dest of extractLinkDestinations(visible)) {
        checkLink(doc, lineNum, dest);
      }
    }
  }

  for (const src of sourceFiles) {
    const raw = source.read(src.rel);
    const lines = toLines(raw);

    if (src.config.style && src.config.style.requireUtf8NoBom) {
      if (raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) {
        report(src.rel, 1, 'check1', 'BOM UTF-8 proibido no arquivo: ' + src.rel);
      }
    }

    for (const sym of (src.config.symbols || [])) {
      const re = symbolPattern(sym);
      if (!re) continue;
      const found = lines.some(l => re.test(l));
      if (!found) {
        report(src.rel, 1, 'check2', "símbolo '" + sym.name + "' (" + sym.kind + ') não encontrado em: ' + src.rel);
      }
    }

    for (const tok of (src.config.tokens || [])) {
      const re = new RegExp(tok.declarationPattern);
      const matches = [];
      lines.forEach((l, idx) => {
        if (re.test(l)) matches.push(idx + 1);
      });
      if (matches.length !== tok.expectedCount) {
        report(src.rel, 1, 'check4', "token '" + tok.token + "': esperado " + tok.expectedCount + ' ocorrência(s), encontrado ' + matches.length);
      }
      for (const lineNum of matches) {
        let k = lineNum - 2;
        while (k >= 0 && lines[k].trim() === '') k--;
        const comment = [];
        while (k >= 0) {
          const l = lines[k].trim();
          if (l.startsWith('//')) {
            comment.unshift(l);
            k--;
          } else if (l.endsWith('*/')) {
            while (k >= 0) {
              comment.unshift(lines[k].trim());
              if (lines[k].trim().startsWith('/*')) break;
              k--;
            }
            k--;
          } else {
            break;
          }
        }
        if (comment.join(' ').indexOf('WHY:') === -1) {
          report(src.rel, lineNum, 'check4', "token '" + tok.token + "' na linha " + lineNum + " não possui comentário contendo 'WHY:'");
        }
      }
    }
  }

  return {
    errors,
    warnings,
    stats: {
      mdFiles: mdFiles.length,
      sourceFiles: sourceFiles.length,
      ignoredCount,
      errors: errors.length,
      warnings: warnings.length,
      sourceLabel: source.label,
      nothingToAudit: false
    }
  };
}

module.exports = { auditDocs };
