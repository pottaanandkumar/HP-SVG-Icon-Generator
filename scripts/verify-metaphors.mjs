import { chromium } from "playwright";
const SVG = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="16" height="16" stroke="currentColor" stroke-width="1"/></svg>`;

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on("pageerror", (err) => console.log("PAGE EXCEPTION:", err.message));

await page.route("**/api/agent/generate", async (route) => {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      ok: true,
      svgs: [SVG, SVG],
      analysis: {
        semanticMatch: "test semantic match",
        namedFeatureResearch: "test research",
        structuralApproaches: [
          "Standard cast body with concentric signal arcs",
          "Screen frame with wireless dot indicator",
          "Compact monitor silhouette with projection lines",
        ],
      },
      libraryNote: null,
    }),
  });
});

await page.goto("http://localhost:3001/icon-generator", { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await page.locator('input[placeholder*="printer"]').fill("cast");
await page.getByRole("button", { name: /Generate/i }).click();
await page.waitForSelector("text=Metaphor Options", { timeout: 10000 });
await page.waitForTimeout(300);
await page.screenshot({ path: "/tmp/metaphor-options.png" });
await browser.close();
