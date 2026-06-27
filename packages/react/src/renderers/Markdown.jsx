import React from "react";
import { tokenizeInline } from "./markdownInline.js";
import { createSlugger } from "./markdownOutline.js";

/*
 * Minimal markdown subset renderer. React elements only, no innerHTML.
 * Subset: ATX headings, paragraphs, unordered and ordered lists,
 * blockquotes, fenced code, horizontal rules, GFM pipe tables, inline
 * code/bold/italic/links, and bare http(s) URL autolinks. Link hrefs are
 * whitelisted to http(s), mailto, and fragment; anything else renders as
 * plain text. The inline tokenizer lives in markdownInline.js.
 */

function inline(text) {
  return tokenizeInline(text).map((t, i) => {
    if (t.type === "code") return <code key={i}>{t.value}</code>;
    if (t.type === "strong") return <strong key={i}>{t.value}</strong>;
    if (t.type === "em") return <em key={i}>{t.value}</em>;
    if (t.type === "link") {
      const safe = /^(https?:|mailto:|#)/i.test(t.href);
      return safe ? (
        <a key={i} href={t.href} target="_blank" rel="noreferrer">
          {t.text}
        </a>
      ) : (
        `${t.text} (${t.href})`
      );
    }
    return t.value;
  });
}

const BLOCK_START = /^(#{1,6}\s|```|>|\s*[-*]\s+|\s*\d+\.\s+|(-{3,}|\*{3,})\s*$)/;

export default function Markdown({ value }) {
  const lines = String(value || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  let key = 0;
  const slug = createSlugger();
  const splitRow = (l) =>
    l.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith("```")) {
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]);
      i++;
      blocks.push(
        <pre key={key++} className="pf-md-pre">
          <code>{buf.join("\n")}</code>
        </pre>
      );
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const Tag = /** @type {keyof React.JSX.IntrinsicElements} */ (`h${h[1].length}`);
      blocks.push(<Tag key={key++} id={slug(h[2])}>{inline(h[2])}</Tag>);
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push(<hr key={key++} />);
      i++;
      continue;
    }
    if (line.startsWith(">")) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith(">")) buf.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push(<blockquote key={key++}>{inline(buf.join(" "))}</blockquote>);
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i]))
        items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ""));
      const Tag = ordered ? "ol" : "ul";
      blocks.push(
        <Tag key={key++}>
          {items.map((t, j) => (
            <li key={j}>{inline(t)}</li>
          ))}
        </Tag>
      );
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])) {
      const head = splitRow(line);
      i += 2;
      const body = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) body.push(splitRow(lines[i++]));
      blocks.push(
        <table key={key++} className="pf-table">
          <thead>
            <tr>
              {head.map((c, j) => (
                <th key={j}>{inline(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, ci) => (
                  <td key={ci}>{inline(c)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
      continue;
    }
    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !BLOCK_START.test(lines[i])) buf.push(lines[i++]);
    blocks.push(<p key={key++}>{inline(buf.join(" "))}</p>);
  }
  return <div className="pf-md">{blocks}</div>;
}
