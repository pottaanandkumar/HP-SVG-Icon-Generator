import JSZip from "jszip";

/** Repo icons ship as fixed fill="white" glyphs; agent-generated icons ship
 * as fixed stroke="black" outlines (some agent versions single-quote their
 * attributes instead of double-quoting, e.g. fill='currentColor' -- matching
 * both quote styles avoids silently no-op'ing against those). Converting
 * both to currentColor lets the same markup pick up color from CSS
 * (mode-based ink/white, or an explicit override) instead of staying stuck
 * on one hardcoded value regardless of light/dark background. */
export function toCurrentColor(svg: string): string {
  return svg
    .replace(/fill=(["'])(#fff(fff)?|white)\1/gi, 'fill="currentColor"')
    .replace(/stroke=(["'])(#000(000)?|black)\1/gi, 'stroke="currentColor"');
}

/** Sets the size on the root <svg> element specifically -- agent-generated
 * icons often only carry a viewBox with no width/height at all, and an
 * unanchored replace risks touching a child element's width/height (e.g. a
 * <rect width="16">) instead. Matching the opening <svg ...> tag directly and
 * stripping+reinserting its own width/height handles both "missing" and
 * "present" cases the same way. Strips both "..." and '...' quoted
 * width/height (some agent versions single-quote all their attributes) so a
 * leftover old value can't win out over the new one via attribute-duplicate
 * rules when the browser parses the markup. */
export function applySize(svg: string, pxSize: number): string {
  return svg.replace(/<svg\b([^>]*)>/i, (_match, attrs: string) => {
    const stripped = attrs.replace(/\s*(width|height)=("[^"]*"|'[^']*')/gi, "");
    return `<svg${stripped} width="${pxSize}" height="${pxSize}">`;
  });
}

/**
 * Materializes an icon for copy/download. `color: null` means "no override" —
 * the exported SVG keeps currentColor so it inherits color from whatever CSS
 * context it's dropped into (the standard pattern for icon libraries).
 * Passing an explicit color bakes it in as a literal fill/stroke value.
 * Best-effort for arbitrary agent SVGs whose color attributes we don't control.
 */
export function applyIconStyle(svg: string, color: string | null, pxSize: number): string {
  const colored = color
    ? svg
        .replace(/fill=(["'])(#fff(fff)?|white|currentColor)\1/gi, `fill="${color}"`)
        .replace(/stroke=(["'])(#000(000)?|black|currentColor)\1/gi, `stroke="${color}"`)
    : toCurrentColor(svg);
  return applySize(colored, pxSize);
}

export function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "icon";
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadSvg(svg: string, fileName: string) {
  downloadBlob(new Blob([svg], { type: "image/svg+xml" }), fileName);
}

export function svgToPngBlob(svg: string, size = 512): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const svgBlob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Canvas context unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, size, size);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("PNG conversion failed"));
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to rasterize SVG"));
    };
    img.src = url;
  });
}

export async function copyToClipboard(text: string) {
  await navigator.clipboard.writeText(text);
}

export async function downloadAllAsZip(
  icons: { name: string; svg: string }[],
  format: "svg" | "png",
  zipFileName: string
) {
  const zip = new JSZip();
  for (const icon of icons) {
    const base = slugify(icon.name);
    if (format === "svg") {
      zip.file(`${base}.svg`, icon.svg);
    } else {
      const png = await svgToPngBlob(icon.svg);
      zip.file(`${base}.png`, png);
    }
  }
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, zipFileName);
}
