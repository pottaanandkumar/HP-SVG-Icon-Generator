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

export async function searchIconRepo(query: string): Promise<IconRepoMatch[]> {
  const target = normalize(query);
  if (!target) return [];

  const files = await fs.readdir(REPO_DIR);
  const svgFiles = files.filter((f) => f.toLowerCase().endsWith(".svg"));

  const matches: IconRepoMatch[] = [];
  for (const fileName of svgFiles) {
    const name = fileName.replace(/\.svg$/i, "");
    if (normalize(name).includes(target) || target.includes(normalize(name))) {
      const svg = await fs.readFile(path.join(REPO_DIR, fileName), "utf-8");
      matches.push({ name, fileName, svg });
    }
  }
  return matches;
}
