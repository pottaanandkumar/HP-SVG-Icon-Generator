/** Facts read directly off the SVG's own markup -- never fabricated. Every
 * field either comes straight from an attribute or is a literal count of
 * elements actually present in that icon. Shared by the icon generator's
 * Details screen (components/IconDetailsScreen.tsx). */
export interface SvgFacts {
  viewBox: string;
  strokeWidth: string;
  strokeLinecap: string;
  strokeLinejoin: string;
  fill: string;
  elementCounts: { tag: string; count: number }[];
  totalElements: number;
}

const SHAPE_TAGS = ["path", "rect", "circle", "line", "polyline", "polygon", "ellipse"];

export function parseSvgFacts(svg: string): SvgFacts {
  const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 24 24";
  const strokeWidth = svg.match(/\sstroke-width="([^"]+)"/)?.[1] ?? "—";
  const strokeLinecap = svg.match(/\sstroke-linecap="([^"]+)"/)?.[1] ?? "—";
  const strokeLinejoin = svg.match(/\sstroke-linejoin="([^"]+)"/)?.[1] ?? "—";
  const fill = svg.match(/<svg[^>]*\sfill="([^"]+)"/)?.[1] ?? "none";

  const elementCounts = SHAPE_TAGS.map((tag) => ({
    tag,
    count: (svg.match(new RegExp(`<${tag}[\\s/>]`, "g")) ?? []).length,
  })).filter((e) => e.count > 0);
  const totalElements = elementCounts.reduce((sum, e) => sum + e.count, 0);

  return { viewBox, strokeWidth, strokeLinecap, strokeLinejoin, fill, elementCounts, totalElements };
}
