// Minimal SVG path (`d` attribute) validator. The AAVA agent is an LLM and
// occasionally emits a path with a token-generation slip (a truncated or
// malformed number) — the browser doesn't throw on this, it just silently
// drops the bad segment and logs a console warning, leaving a visibly broken
// icon. This lets us filter those out server-side instead of shipping them.
const NUMBER_TOKEN = /^[-+]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][-+]?\d+)?/;

const ARG_COUNTS: Record<string, number> = {
  m: 2,
  l: 2,
  t: 2,
  h: 1,
  v: 1,
  c: 6,
  s: 4,
  q: 4,
  a: 7,
  z: 0,
};

function isValidPathData(d: string): boolean {
  const n = d.length;
  let i = 0;
  let cmd: string | null = null;

  const skipSeparators = () => {
    while (i < n && /[\s,]/.test(d[i])) i++;
  };

  while (i < n) {
    skipSeparators();
    if (i >= n) break;

    if (/[MmLlHhVvCcSsQqTtAaZz]/.test(d[i])) {
      cmd = d[i].toLowerCase();
      i++;
      continue;
    }

    if (!cmd || cmd === "z") return false; // stray number with no command, or after Z

    const argCount = ARG_COUNTS[cmd];
    for (let k = 0; k < argCount; k++) {
      skipSeparators();
      if (cmd === "a" && (k === 3 || k === 4)) {
        // large-arc-flag / sweep-flag: exactly one character, '0' or '1'.
        if (i >= n || (d[i] !== "0" && d[i] !== "1")) return false;
        i++;
      } else {
        const match = NUMBER_TOKEN.exec(d.slice(i));
        if (!match || match[0].length === 0) return false;
        i += match[0].length;
      }
    }
  }

  return cmd !== null;
}

/** True if the string looks like an SVG and every `d="..."` path in it (if
 * any — icons built only from rect/circle/line have none) is well-formed. */
export function isValidSvgMarkup(svg: string): boolean {
  if (!/<svg[\s>]/.test(svg)) return false;
  const dMatches = Array.from(svg.matchAll(/\sd="([^"]*)"/g));
  return dMatches.every(([, d]) => d.trim().length > 0 && isValidPathData(d));
}
