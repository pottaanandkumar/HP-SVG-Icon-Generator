import fs from "fs/promises";
import path from "path";

const REPO_DIR = path.join(process.cwd(), "data", "icon-repo");

export interface IconRepoMatch {
  name: string;
  fileName: string;
  svg: string;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Splits on non-alphanumeric separators so multi-word matching happens on
 * whole words, not raw characters -- otherwise a short icon name like "id"
 * would match any search string that merely contains those letters in
 * sequence somewhere (e.g. "catridge" contains "id"). */
function wordsOf(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export async function searchIconRepo(query: string): Promise<IconRepoMatch[]> {
  const target = normalize(query);
  if (!target) return [];
  const queryWords = new Set(wordsOf(query));

  const files = await fs.readdir(REPO_DIR);
  const svgFiles = files.filter((f) => f.toLowerCase().endsWith(".svg"));

  const matches: IconRepoMatch[] = [];
  for (const fileName of svgFiles) {
    const name = fileName.replace(/\.svg$/i, "");
    const normalizedName = normalize(name);
    const nameWords = wordsOf(name);
    const isMatch =
      normalizedName === target ||
      // Full search query reads as (part of) the icon's name, e.g. "cartridge" -> "cartridge-color".
      // Length-gated so a trivial 1-2 char query doesn't substring-match into unrelated longer names.
      (target.length >= 3 && normalizedName.includes(target)) ||
      // Every word in the icon's name appears as a whole word in the query,
      // e.g. icon "cartridge" matches query "print cartridge for hp".
      (nameWords.length > 0 && nameWords.every((w) => queryWords.has(w)));
    if (isMatch) {
      const svg = await fs.readFile(path.join(REPO_DIR, fileName), "utf-8");
      matches.push({ name, fileName, svg });
    }
  }
  return matches;
}
