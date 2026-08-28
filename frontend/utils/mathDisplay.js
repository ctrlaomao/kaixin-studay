const SUPER = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "+": "⁺",
  "-": "⁻",
  n: "ⁿ",
};
const SUB = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",
  a: "ₐ",
  n: "ₙ",
  i: "ᵢ",
};

function mapChars(s, table) {
  return String(s)
    .split("")
    .map((c) => table[c] || c)
    .join("");
}

function wrapGroup(inner) {
  const t = String(inner);
  if (!t) return "";
  if (t.length === 1) return t;
  return "(" + t + ")";
}

function latexOnce(src) {
  let t = String(src);
  t = t.replace(/\\left|\\right/g, "");
  t = t.replace(/\\mathrm\{([^{}]*)\}/g, "$1");
  t = t.replace(/\\operatorname\{([^{}]*)\}/g, "$1");
  t = t.replace(/\\text\{([^{}]*)\}/g, "$1");
  t = t.replace(/\\times/g, "×");
  t = t.replace(/\\div/g, "÷");
  t = t.replace(/\\pm/g, "±");
  t = t.replace(/\\mp/g, "∓");
  t = t.replace(/\\cdot/g, "·");
  t = t.replace(/\\cdots/g, "⋯");
  t = t.replace(/\\ldots/g, "…");
  t = t.replace(/\\approx/g, "≈");
  t = t.replace(/\\neq/g, "≠");
  t = t.replace(/\\leq/g, "≤");
  t = t.replace(/\\geq/g, "≥");
  t = t.replace(/\\infty/g, "∞");
  t = t.replace(/\\sqrt\[3\]\{([^{}]+)\}/g, (_, x) => "∛" + wrapGroup(x));
  t = t.replace(/\\sqrt\[4\]\{([^{}]+)\}/g, (_, x) => "∜" + wrapGroup(x));
  t = t.replace(/\\sqrt\[(\d+)\]\{([^{}]+)\}/g, (_, n, x) => n + "√" + wrapGroup(x));
  t = t.replace(/\\sqrt\{([^{}]+)\}/g, (_, x) => "√" + wrapGroup(x));
  t = t.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, (_, a, b) => wrapGroup(a) + "/" + wrapGroup(b));
  t = t.replace(/\^\{([^}]+)\}/g, (_, x) => mapChars(x, SUPER));
  t = t.replace(/\^([0-9+\-n])/g, (_, x) => mapChars(x, SUPER));
  t = t.replace(/_\{([^}]+)\}/g, (_, x) => mapChars(x, SUB));
  t = t.replace(/_([0-9a-zA-Z])/g, (_, x) => mapChars(x, SUB));
  t = t.replace(/\\,/g, " ");
  t = t.replace(/\\ /g, " ");
  t = t.replace(/\\;/g, " ");
  return t;
}

function latexToPlain(src) {
  let t = String(src || "");
  for (let i = 0; i < 8; i += 1) {
    const next = latexOnce(t);
    if (next === t) break;
    t = next;
  }
  t = t.replace(/\\\\/g, "\n");
  t = t.replace(/[{}]/g, "");
  t = t.replace(/\$/g, "");
  return t.replace(/[ \t]+\n/g, "\n").trim();
}

function replaceInlineMath(text) {
  const s = String(text || "");
  let out = "";
  let i = 0;
  while (i < s.length) {
    if (s.startsWith("\\[", i)) {
      const end = s.indexOf("\\]", i + 2);
      if (end < 0) {
        out += s.slice(i);
        break;
      }
      out += latexToPlain(s.slice(i + 2, end));
      i = end + 2;
      continue;
    }
    if (s.startsWith("\\(", i)) {
      const end = s.indexOf("\\)", i + 2);
      if (end < 0) {
        out += s.slice(i);
        break;
      }
      out += latexToPlain(s.slice(i + 2, end));
      i = end + 2;
      continue;
    }
    if (s[i] === "$") {
      const dbl = s[i + 1] === "$";
      const mark = dbl ? "$$" : "$";
      const start = i + mark.length;
      const end = s.indexOf(mark, start);
      if (end < 0) {
        out += s.slice(i);
        break;
      }
      out += latexToPlain(s.slice(start, end));
      i = end + mark.length;
      continue;
    }
    out += s[i];
    i += 1;
  }
  return out;
}

function parseMdTable(chunk) {
  const lines = String(chunk)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const rows = [];
  for (const line of lines) {
    if (/^\|?\s*:?-{3,}/.test(line.replace(/\|/g, ""))) continue;
    if (line.indexOf("|") < 0) continue;
    const cells = line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => replaceInlineMath(c.trim()));
    if (cells.length) rows.push(cells);
  }
  return rows.length ? rows : null;
}

function formatStemBlocks(raw) {
  const text = String(raw || "");
  const blocks = [];
  const lines = text.split("\n");
  let i = 0;
  let para = [];
  const flushPara = () => {
    const p = para.join("\n").trim();
    para = [];
    if (!p) return;
    blocks.push({ kind: "p", text: replaceInlineMath(p), i: blocks.length });
  };
  while (i < lines.length) {
    if (lines[i].indexOf("|") >= 0) {
      flushPara();
      const tbl = [];
      while (i < lines.length && (lines[i].indexOf("|") >= 0 || !String(lines[i]).trim())) {
        if (String(lines[i]).trim()) tbl.push(lines[i]);
        i += 1;
      }
      const rows = parseMdTable(tbl.join("\n"));
      if (rows) blocks.push({ kind: "table", rows, i: blocks.length });
      else para.push(tbl.join("\n"));
      continue;
    }
    para.push(lines[i]);
    i += 1;
  }
  flushPara();
  if (/数轴/.test(text) && !blocks.some((b) => b.kind === "note")) {
    blocks.push({ kind: "note", text: "原卷含数轴示意图，请对照拍照原图。", i: blocks.length });
  }
  if (!blocks.length) {
    blocks.push({ kind: "p", text: replaceInlineMath(text) || text, i: 0 });
  }
  return blocks;
}

function formatQuestionDisplay(q) {
  const stem = (q && q.stem) || "";
  const answer = (q && q.studentAnswer) || "";
  return {
    stemBlocks: formatStemBlocks(stem),
    answerText: replaceInlineMath(answer),
  };
}

module.exports = { latexToPlain, replaceInlineMath, formatStemBlocks, formatQuestionDisplay };
