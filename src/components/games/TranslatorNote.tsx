import type { ReactNode } from 'react';

/**
 * Renders `game.translator_note` with a tiny, safe subset of Markdown:
 *   - [label](url)  → clickable link with custom label
 *   - bare http(s):// url → clickable link (label = the url itself)
 * Everything else is emitted as plain text nodes.
 *
 * Security model: we never use dangerouslySetInnerHTML. All text — the
 * note itself and link labels — passes through as React children, which
 * JSX/React always escapes on render. That means arbitrary HTML/script
 * markup typed into the note (e.g. `<img onerror=...>`, `<script>`) can
 * never execute; at worst it shows up as literal text. The only thing we
 * actively construct is the `href` attribute, so that's the only thing we
 * validate: `isSafeHref` requires the URL to parse and use the http/https
 * scheme, rejecting `javascript:`, `data:`, `vbscript:`, protocol-relative
 * `//evil.com`, and malformed URLs. Anything that fails validation is left
 * as plain text instead of becoming a link — fail closed, not open.
 * External links also get rel="noopener noreferrer nofollow ugc" so a
 * malicious/compromised target can't reach back into window.opener and
 * search engines don't pass authority through admin-entered links.
 */

const MD_LINK_OR_URL = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"')]+)/g;

function isSafeHref(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function renderLine(line: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let matchIndex = 0;

  for (const match of line.matchAll(MD_LINK_OR_URL)) {
    const [full, mdLabel, mdUrl, bareUrl] = match;
    const start = match.index ?? 0;

    if (start > lastIndex) nodes.push(line.slice(lastIndex, start));

    const rawUrl = mdUrl ?? bareUrl;
    const safeUrl = rawUrl ? isSafeHref(rawUrl) : null;
    const label = mdLabel ?? bareUrl ?? full;

    if (safeUrl) {
      nodes.push(
        <a
          key={`${keyPrefix}-${matchIndex++}`}
          href={safeUrl}
          target="_blank"
          rel="noopener noreferrer nofollow ugc"
          className="text-copper-light underline decoration-copper/40 underline-offset-2 hover:text-copper transition-colors break-words"
        >
          {label}
        </a>
      );
    } else {
      // Unsafe or unparsable URL — keep the original text as-is, no link.
      nodes.push(full);
    }

    lastIndex = start + full.length;
  }

  if (lastIndex < line.length) nodes.push(line.slice(lastIndex));
  return nodes;
}

export default function TranslatorNote({ note }: { note: string }) {
  const lines = note.split('\n').filter(Boolean);
  return (
    <>
      {lines.map((line, i) => (
        <p key={i} className="text-ghost-dim text-sm leading-relaxed break-words">
          {renderLine(line, `l${i}`)}
        </p>
      ))}
    </>
  );
}
