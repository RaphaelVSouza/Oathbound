'use strict';

// Auditor estático de documentação portável. Requer Node >= 22 (guarda em audit-docs.js).
// Sem dependências externas.

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { createSource } = require('./audit-docs.sources.js');

const cli = process.argv.slice(2);
let projectArg = null;
let configArg = null;
let isStaged = false;
let isVerbose = false;
for (let i = 0; i < cli.length; i++) {
  const arg = cli[i];
  if (arg === '--project' || arg === '--config') {
    if (!cli[i + 1] || cli[i + 1].startsWith('--')) {
      console.error('audit-docs: falta valor para ' + arg);
      process.exit(2);
    }
    if (arg === '--project') projectArg = cli[++i];
    else configArg = cli[++i];
  } else if (arg === '--staged') {
    isStaged = true;
  } else if (arg === '--verbose') {
    isVerbose = true;
  } else {
    console.error('audit-docs: opção desconhecida: ' + arg);
    process.exit(2);
  }
}
const repoRoot = path.resolve(projectArg || path.join(__dirname, '..'));
const configPath = path.resolve(configArg || path.join(repoRoot, 'tools', 'audit-docs.config.js'));
if (!fs.existsSync(repoRoot) || !fs.statSync(repoRoot).isDirectory()) {
  console.error('audit-docs: raiz do projeto não encontrada: ' + repoRoot);
  process.exit(2);
}
if (!fs.existsSync(configPath)) {
  console.error('audit-docs: configuração não encontrada: ' + configPath);
  process.exit(2);
}
const config = require(configPath);

// ---------------------------------------------------------------------------
// Configuração com defaults
// ---------------------------------------------------------------------------

const SEVERITIES = ['error', 'warn', 'off'];
const DEFAULT_CHECKS = {
  anchors: 'warn',      // check1a: fragmento #ancora sem cabeçalho/id correspondente
  portability: 'warn',  // check1b: caixa divergente ou barra invertida em link
  outsideRepo: 'warn'   // check1c: link relativo que sai da raiz do repositório
};
const checks = Object.assign({}, DEFAULT_CHECKS, config.checks || {});
for (const key of Object.keys(checks)) {
  if (SEVERITIES.indexOf(checks[key]) === -1) {
    console.error("audit-docs: checks." + key + " inválido: '" + checks[key] + "' (use error | warn | off)");
    process.exit(1);
  }
}

const DEFAULT_LINE_REF_EXTENSIONS = ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'cs', 'vb', 'html',
  'aspx', 'ascx', 'cshtml', 'astro', 'scss', 'css', 'json'];
const lineRefExtensions = config.lineRefExtensions || DEFAULT_LINE_REF_EXTENSIONS;
const lineRefRegex = new RegExp('\\.(' + lineRefExtensions.map(escapeRegex).join('|') + '):\\d+', 'i');

const blocklist = config.blocklist || {};
const blockNames = blocklist.names || [];
const blockSegments = blocklist.pathSegments || [];
const blockFilePatterns = blocklist.filePatterns || [];
const lineRefAllowlist = config.lineRefAllowlist || [];
const maxBytes = (config.limits && config.limits.maxBytes) || Infinity;

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function git(gitArgs, input) {
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

// ---------------------------------------------------------------------------
// Modo --staged: decide se há algo a auditar
// ---------------------------------------------------------------------------

if (isStaged) {
  let shouldRun = false;
  try {
    const out = git(['diff', '--cached', '--name-status', '-z', '--diff-filter=ACMRD']).toString('utf8');
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
    console.error('audit-docs: erro ao verificar status staged do git: ' + err.message);
    process.exit(1);
  }
  if (!shouldRun) {
    console.log('audit-docs: nada a auditar');
    process.exit(0);
  }
}

let source;
try {
  source = createSource({ staged: isStaged, repoRoot, git });
} catch (err) {
  console.error('audit-docs: erro ao ler o índice do git: ' + err.message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Relatório
// ---------------------------------------------------------------------------

const errors = [];
const warnings = [];
let ignoredCount = 0;

function report(rel, lineNum, checkId, message, severity) {
  const sev = severity || 'error';
  if (sev === 'off') return;
  const entry = rel + ':' + (lineNum || 1) + ': [' + checkId + '] ' + (sev === 'warn' ? 'aviso: ' : '') + message;
  (sev === 'warn' ? warnings : errors).push(entry);
}

// ---------------------------------------------------------------------------
// Coleta de documentos
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Coleta de arquivos-fonte dos targets
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Parsing de Markdown
// ---------------------------------------------------------------------------

function toLines(buf) {
  let text = buf.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text.replace(/\r\n?/g, '\n').split('\n');
}

// Classifica cada linha: dentro de cerca, front matter, comentário HTML.
// Cercas seguem CommonMark: até 3 espaços de indentação; fecha com o mesmo caractere,
// comprimento >= abertura e sem info string.
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
    // Comentários HTML: o conteúdo é removido para fins de links e cabeçalhos.
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

// Remove code spans inline respeitando o comprimento da sequência de crases.
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

// Slug no formato do GitHub (github-slugger): minúsculas, remove pontuação e símbolos,
// preserva letras (inclusive acentuadas), dígitos, '_' e '-', cada espaço vira '-'.
function slugify(text) {
  return stripInlineMarkdown(text)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-');
}

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

// Extrai destinos de links inline [texto](destino "titulo"), imagens e definições de referência.
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

function checkLink(doc, lineNum, destRaw) {
  const dest = destRaw.trim();

  // Check 2: caminhos absolutos, protocolo file: e UNC.
  if (/^(?:[A-Za-z]:[\\/]|file:)/i.test(dest) || /^\\\\/.test(dest)) {
    report(doc.rel, lineNum, 'check2', 'caminho absoluto ou protocolo file: em link: ' + dest);
    return;
  }
  // Links externos (http, https, mailto, tel etc.) e protocol-relative.
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

function checkAnchor(doc, lineNum, targetRel, fragment, dest) {
  if (checks.anchors === 'off') return;
  const anchors = getAnchors(targetRel);
  if (!anchors.has(fragment.toLowerCase())) {
    report(doc.rel, lineNum, 'check1', 'âncora inexistente em ' + targetRel + ': ' + dest, checks.anchors);
  }
}

// Divide uma linha de tabela GFM em células, respeitando \| e code spans.
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

// ---------------------------------------------------------------------------
// Checks em Markdown
// ---------------------------------------------------------------------------

for (const doc of mdFiles) {
  if (isVerbose) console.log('[verbose] lendo ' + doc.rel);
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

    // Detecção de tabela GFM: cabeçalho seguido de linha delimitadora.
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
      // Check 6c: coluna cujo cabeçalho é "linha(s)"/"line(s)".
      for (const colIdx of tableLineCols) {
        if (cells[colIdx] && cells[colIdx].trim() !== '') {
          report(doc.rel, lineNum, 'check6', 'coluna de linhas preenchida em tabela: ' + cells[colIdx].trim());
        }
      }
      // Check 6d: célula composta somente de intervalo com travessão.
      for (const c of cells) {
        const ct = c.trim();
        if (/^\d+\s*[–—]\s*\d+$/.test(ct)) {
          report(doc.rel, lineNum, 'check6', 'célula contém intervalo de linhas com travessão: ' + ct);
        }
      }
    }

    // Check 6a e 6b: referências a linha (fora de cercas).
    if (enforceLineRefs) {
      if (/#L\d+/i.test(line)) {
        report(doc.rel, lineNum, 'check6', 'referência a fragmento de linha #L encontrada: ' + trimmed);
      }
      if (lineRefRegex.test(line)) {
        report(doc.rel, lineNum, 'check6', 'referência a arquivo:linha encontrada: ' + trimmed);
      }
    }

    // Check 1 e 2: links.
    const visible = stripCodeSpans(info[i].visible);
    for (const dest of extractLinkDestinations(visible)) {
      checkLink(doc, lineNum, dest);
    }
  }
}

// ---------------------------------------------------------------------------
// Checks em arquivos-fonte
// ---------------------------------------------------------------------------

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
      return new RegExp('^\\s*var\\s+' + n + '\\s*=\\s*' + escapeRegex(sym.aliasOf) + '\\s*;');
    default:
      return null;
  }
}

for (const src of sourceFiles) {
  if (isVerbose) console.log('[verbose] lendo ' + src.rel);
  const buffer = source.read(src.rel);
  const hasBom = buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
  if (src.config.style && src.config.style.requireUtf8NoBom && hasBom) {
    report(src.rel, 1, 'check5', 'arquivo contém UTF-8 BOM proibido');
  }
  const lines = toLines(buffer);

  // Check 3: TSDoc por símbolo canônico.
  const symbols = src.config.symbols || [];
  const declared = {};

  for (const sym of symbols) {
    const pattern = symbolPattern(sym);
    if (!pattern) {
      report(src.rel, 1, 'check3', "tipo de símbolo desconhecido '" + sym.kind + "' para '" + sym.name + "'");
      continue;
    }
    const matches = [];
    lines.forEach((l, idx) => {
      if (pattern.test(l)) matches.push(idx + 1);
    });
    if (matches.length === 0) {
      report(src.rel, 1, 'check3', "símbolo canônico '" + sym.name + "' não encontrado");
      continue;
    }
    if (matches.length > 1) {
      report(src.rel, matches[0], 'check3', "declaração ambígua do símbolo '" + sym.name + "' (" + matches.length + ' ocorrências)');
      continue;
    }
    const declLine = matches[0];
    declared[sym.name] = declLine;
    if (sym.kind === 'alias') continue;

    let k = declLine - 2;
    while (k >= 0 && lines[k].trim() === '') k--;
    if (k < 0) {
      report(src.rel, declLine, 'check3', "símbolo '" + sym.name + "' não possui bloco TSDoc acima da declaração");
      continue;
    }
    const prev = lines[k].trim();
    if (prev.startsWith('//')) {
      report(src.rel, declLine, 'check3', "comentário // entre TSDoc e declaração de '" + sym.name + "' não é permitido");
      continue;
    }
    if (!prev.endsWith('*/')) {
      report(src.rel, declLine, 'check3', "símbolo '" + sym.name + "' não possui bloco TSDoc terminado em */ imediatamente acima da declaração");
      continue;
    }
    let j = k;
    let kind = null;
    while (j >= 0) {
      const cur = lines[j].trim();
      if (cur.startsWith('/**')) { kind = 'tsdoc'; break; }
      if (cur.startsWith('/*')) { kind = 'simple'; break; }
      j--;
    }
    if (kind === 'simple') {
      report(src.rel, declLine, 'check3', "símbolo '" + sym.name + "' possui bloco /* comum em vez de TSDoc canônico /**");
    } else if (kind === null) {
      report(src.rel, declLine, 'check3', "início do bloco TSDoc /** não encontrado acima de '" + sym.name + "'");
    }
  }

  for (const sym of symbols) {
    if (sym.kind === 'alias' && !declared[sym.aliasOf]) {
      report(src.rel, 1, 'check3', "alias '" + sym.name + "' aponta para '" + sym.aliasOf + "', que não possui declaração canônica válida");
    }
  }

  // Check 4: tokens com justificativa // WHY:.
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

// ---------------------------------------------------------------------------
// Saída
// ---------------------------------------------------------------------------

for (const w of warnings) console.warn(w);
for (const e of errors) console.error(e);

console.log(
  'fonte: ' + source.label +
  ' | .md lidos: ' + mdFiles.length +
  ' | fontes lidos: ' + sourceFiles.length +
  ' | ignorados: ' + ignoredCount +
  ' | violações: ' + errors.length +
  ' | avisos: ' + warnings.length
);

process.exit(errors.length > 0 ? 1 : 0);
