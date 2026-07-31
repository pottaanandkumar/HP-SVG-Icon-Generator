import { parseSvgFacts } from "./iconReport";

/**
 * A transparent, rule-based comparison score -- NOT an AI judgment. The
 * research agent's real output doesn't include confidence percentages,
 * scoring, or pass/fail accessibility validation (confirmed against a live
 * response, see scripts/inspect-raw-agent.mjs history), so none of this is
 * the agent's own verdict. Every number here is computed from the actual
 * SVG markup against fixed, disclosed rules -- shown to the user labeled as
 * "computed" throughout so it's never confused with agent reasoning.
 */

const STANDARD_GRID = "0 0 24 24";
const MIN_LEGIBLE_STROKE_PX = 0.75;
const IDEAL_MIN_ELEMENTS = 1;
const IDEAL_MAX_ELEMENTS = 10;

export interface ScoreCheck {
  label: string;
  pass: boolean;
  detail: string;
  points: number;
  maxPoints: number;
}

export interface DesignScore {
  total: number;
  checks: ScoreCheck[];
}

export function computeDesignScore(svg: string): DesignScore {
  const facts = parseSvgFacts(svg);
  const strokeWidthNum = parseFloat(facts.strokeWidth);
  const viewBoxWidth = parseFloat(facts.viewBox.split(/\s+/)[2] ?? "24") || 24;
  const legibleAt16 = !isNaN(strokeWidthNum) && strokeWidthNum * (16 / viewBoxWidth) >= MIN_LEGIBLE_STROKE_PX;

  const checks: ScoreCheck[] = [
    {
      label: "Grid conformance",
      pass: facts.viewBox === STANDARD_GRID,
      detail: `viewBox is "${facts.viewBox}" (standard is "${STANDARD_GRID}")`,
      points: facts.viewBox === STANDARD_GRID ? 20 : 0,
      maxPoints: 20,
    },
    {
      label: "Outlined fill",
      pass: facts.fill === "none",
      detail: `fill="${facts.fill}" (Echo icons are outlined, fill="none")`,
      points: facts.fill === "none" ? 20 : 0,
      maxPoints: 20,
    },
    {
      label: "Stroke defined",
      pass: !isNaN(strokeWidthNum) && strokeWidthNum > 0,
      detail: isNaN(strokeWidthNum) ? "no stroke-width attribute found" : `stroke-width="${facts.strokeWidth}"`,
      points: !isNaN(strokeWidthNum) && strokeWidthNum > 0 ? 20 : 0,
      maxPoints: 20,
    },
    {
      label: "Reasonable complexity",
      pass: facts.totalElements >= IDEAL_MIN_ELEMENTS && facts.totalElements <= IDEAL_MAX_ELEMENTS,
      detail: `${facts.totalElements} element${facts.totalElements === 1 ? "" : "s"} (ideal range ${IDEAL_MIN_ELEMENTS}–${IDEAL_MAX_ELEMENTS})`,
      points: facts.totalElements >= IDEAL_MIN_ELEMENTS && facts.totalElements <= IDEAL_MAX_ELEMENTS ? 20 : 0,
      maxPoints: 20,
    },
    {
      label: "Legible at 16px",
      pass: legibleAt16,
      detail: !isNaN(strokeWidthNum)
        ? `stroke renders ~${(strokeWidthNum * (16 / viewBoxWidth)).toFixed(2)}px thick at 16px (need ≥${MIN_LEGIBLE_STROKE_PX}px)`
        : "stroke width unknown",
      points: legibleAt16 ? 20 : 0,
      maxPoints: 20,
    },
  ];

  const total = checks.reduce((sum, c) => sum + c.points, 0);
  return { total, checks };
}

export interface SizeCheck {
  px: number;
  effectiveStrokePx: number;
  pass: boolean;
}

/** Real math, not a lookup table: at each render size, how thick does this
 * icon's stroke actually end up (in device pixels), and does that clear the
 * minimum-legibility threshold. */
export function computeSizeValidation(svg: string, sizes: number[]): SizeCheck[] {
  const facts = parseSvgFacts(svg);
  const strokeWidthNum = parseFloat(facts.strokeWidth);
  const viewBoxWidth = parseFloat(facts.viewBox.split(/\s+/)[2] ?? "24") || 24;

  return sizes.map((px) => {
    const effectiveStrokePx = isNaN(strokeWidthNum) ? 0 : strokeWidthNum * (px / viewBoxWidth);
    return { px, effectiveStrokePx, pass: effectiveStrokePx >= MIN_LEGIBLE_STROKE_PX };
  });
}
