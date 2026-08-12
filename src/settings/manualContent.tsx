/**
 * THE USER MANUAL'S CONTENT — parsed from `manual.md`, which is a verbatim
 * slice of the vault's [[User Manual Content]] (the deliverable Build reads
 * from; the accuracy pass over it ran 2026-08-03). The .md stays markdown so
 * the author's voice pass edits prose, never code — re-slice the vault note
 * over it and the reader follows.
 *
 * Structure contract (the ruled roster, [[Settings & Configuration]] § Help):
 * `##` = the three groups · `###` = the 23 articles (22 until **Sync** was
 * added to Tools 2026-08-10, user-asked at the step-4 walk; 21 before Bulk
 * Editor). HEADING TEXT IS THE DRAWN DOOR — renaming one is a conform
 * re-freeze; editing a body is free. ADDING one is cheap by construction: the
 * roster renders from the parsed headings and the palette's deep links are
 * generated, so a new article needs no registration anywhere. The FINAL still
 * draws 22 doors and is knowingly stale by one.
 *
 * The renderer is a deliberately tiny markdown subset — exactly what the 22
 * articles use (paragraphs · bold/italic/code · bullet lists · pipe tables ·
 * blockquotes · one fenced code tree · `####` subheads) and nothing more.
 * No template language, no HTML pass-through.
 */
import type { ReactNode } from "react";
import raw from "./manual.md?raw";

export interface ManualArticle {
  id: string;
  title: string;
  group: string;
  blocks: Block[];
}
export interface ManualGroup {
  name: string;
  articles: ManualArticle[];
}

type Block =
  | { t: "p"; text: string }
  | { t: "h4"; text: string }
  | { t: "ul"; items: string[] }
  | { t: "quote"; text: string }
  | { t: "fence"; text: string }
  | { t: "table"; head: string[]; rows: string[][] };

const slug = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** `| a | b |` → trimmed cells. */
const cells = (line: string): string[] =>
  line
    .replace(/^\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((c) => c.trim());

const isTableRule = (line: string): boolean => /^\|[\s:|-]+\|?$/.test(line);

function parseBody(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "" || line.trim() === "---") {
      i++;
      continue;
    }
    if (line.startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        buf.push(lines[i]);
        i++;
      }
      i++; // the closing fence
      blocks.push({ t: "fence", text: buf.join("\n") });
      continue;
    }
    if (line.startsWith("#### ")) {
      blocks.push({ t: "h4", text: line.slice(5).trim() });
      i++;
      continue;
    }
    if (line.startsWith("> ")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        buf.push(lines[i].replace(/^> ?/, ""));
        i++;
      }
      blocks.push({ t: "quote", text: buf.join(" ") });
      continue;
    }
    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length) {
        if (lines[i].startsWith("- ")) {
          items.push(lines[i].slice(2));
          i++;
        } else if (/^\s+\S/.test(lines[i])) {
          // a soft-wrapped continuation of the current item
          items[items.length - 1] += ` ${lines[i].trim()}`;
          i++;
        } else break;
      }
      blocks.push({ t: "ul", items });
      continue;
    }
    if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        if (!isTableRule(lines[i])) rows.push(cells(lines[i]));
        i++;
      }
      const head = rows.shift() ?? [];
      blocks.push({ t: "table", head, rows });
      continue;
    }
    // paragraph — soft-wrapped lines join until the next blank/block start
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(```|#### |> |- |\||---$)/.test(lines[i])
    ) {
      buf.push(lines[i].trim());
      i++;
    }
    blocks.push({ t: "p", text: buf.join(" ") });
  }
  return blocks;
}

function parseManual(src: string): ManualGroup[] {
  const groups: ManualGroup[] = [];
  let group: ManualGroup | null = null;
  let title: string | null = null;
  let body: string[] = [];
  const flush = () => {
    if (group != null && title != null) {
      group.articles.push({ id: slug(title), title, group: group.name, blocks: parseBody(body) });
    }
    title = null;
    body = [];
  };
  for (const line of src.split(/\r?\n/)) {
    if (line.startsWith("## ") && !line.startsWith("### ")) {
      flush();
      group = { name: line.slice(3).trim(), articles: [] };
      groups.push(group);
    } else if (line.startsWith("### ")) {
      flush();
      title = line.slice(4).trim();
    } else if (title != null) {
      body.push(line);
    }
  }
  flush();
  return groups;
}

export const MANUAL_GROUPS: ManualGroup[] = parseManual(raw);

export const findArticle = (id: string): ManualArticle | null => {
  for (const g of MANUAL_GROUPS) for (const a of g.articles) if (a.id === id) return a;
  return null;
};

/**
 * An article's body flattened to lowercase plain text — the manual search
 * bar's haystack (added 2026-08-09, user-asked at tour 7 station 11; title
 * matching rides beside it in HelpPane). Derived from the PARSED blocks, so
 * like the palette's deep links it cannot go stale against the articles.
 * Built lazily and cached: the roster is 23 articles and the cost is one
 * join each, but there is no reason to pay it before the first keystroke.
 */
const textCache = new Map<string, string>();
export function articleText(a: ManualArticle): string {
  const hit = textCache.get(a.id);
  if (hit != null) return hit;
  const parts: string[] = [];
  for (const b of a.blocks) {
    if (b.t === "ul") parts.push(...b.items);
    else if (b.t === "table") parts.push(...b.head, ...b.rows.flat());
    else parts.push(b.text);
  }
  const text = parts.join(" ").toLowerCase();
  textCache.set(a.id, text);
  return text;
}

// ── Inline rendering: `code` · **bold** · *italic*, in that binding order ────

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;

export function inline(text: string): ReactNode {
  const parts = text.split(INLINE);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i}>{inline(part.slice(2, -2))}</strong>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2)
      return <em key={i}>{inline(part.slice(1, -1))}</em>;
    return part;
  });
}

/** The article body on the frozen `.helpart` ramp (subheads = the `.sglbl`
 *  overline idiom — how the frozen specimen draws its inner sections). */
export function ArticleBody({ article }: { article: ManualArticle }) {
  return (
    <>
      {article.blocks.map((b, i) => {
        if (b.t === "p") return <p key={i}>{inline(b.text)}</p>;
        if (b.t === "h4") return <h4 key={i}>{b.text}</h4>;
        if (b.t === "quote") return <blockquote key={i}>{inline(b.text)}</blockquote>;
        if (b.t === "fence") return <pre key={i}>{b.text}</pre>;
        if (b.t === "ul")
          return (
            <ul key={i}>
              {b.items.map((it, j) => (
                <li key={j}>{inline(it)}</li>
              ))}
            </ul>
          );
        return (
          <table key={i}>
            <thead>
              <tr>
                {b.head.map((h, j) => (
                  <th key={j}>{inline(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, j) => (
                <tr key={j}>
                  {r.map((c, k) => (
                    <td key={k}>{inline(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        );
      })}
    </>
  );
}

// ── The palette deep-link handoff (the creator-pending pattern, Shell.tsx) ───
// openManual navigates to settings/help and parks the article id here; a
// freshly-mounting HelpPane consumes it, an already-mounted one hears the
// event. One-shot either way.

let pendingArticle: string | null = null;

export const MANUAL_ARTICLE_EVENT = "cibo:manual-article";

export function requestManualArticle(id: string): void {
  pendingArticle = id;
  window.dispatchEvent(new CustomEvent(MANUAL_ARTICLE_EVENT));
}

/** Non-consuming read — StrictMode runs useState initializers twice, so the
 *  mounting pane PEEKS here and clears in its mount effect. */
export function peekManualArticle(): string | null {
  return pendingArticle;
}

export function takeManualArticle(): string | null {
  const p = pendingArticle;
  pendingArticle = null;
  return p;
}
