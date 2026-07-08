"use client";

import { toCurrentColor, applySize } from "@/lib/svgClientUtils";
import type { IconStateKey } from "@/lib/types";

const DISABLED_COLOR = "#a3a3a3";

const STATE_CHIP_CLASS: Record<IconStateKey, { light: string; dark: string }> = {
  default: { light: "bg-panel", dark: "bg-[#1c1c1e]" },
  hover: { light: "bg-[#e4e4ea]", dark: "bg-[#2a2a31]" },
  active: { light: "bg-brand/10 ring-2 ring-inset ring-brand/40", dark: "bg-brand/25 ring-2 ring-inset ring-brand/50" },
  disabled: { light: "bg-panel", dark: "bg-[#1c1c1e]" },
};

export function IconSwatch({
  svg,
  mode,
  color,
  state = "default",
  size = 96,
  iconSize,
}: {
  svg: string;
  mode: "light" | "dark";
  /** null = auto (ink in light mode, white in dark mode) */
  color: string | null;
  state?: IconStateKey;
  size?: number;
  iconSize?: number;
}) {
  const resolvedIconSize = iconSize ?? Math.round(size * 0.4);
  const markup = applySize(toCurrentColor(svg), resolvedIconSize);
  const chipClass = STATE_CHIP_CLASS[state][mode];
  const autoTextClass = mode === "light" ? "text-ink" : "text-white";
  const overrideColor = state === "disabled" ? DISABLED_COLOR : color;

  return (
    <div
      className={`flex items-center justify-center rounded-xl ${chipClass} ${
        overrideColor ? "" : autoTextClass
      } ${state === "disabled" ? "opacity-40" : ""}`}
      style={{ width: size, height: size, ...(overrideColor ? { color: overrideColor } : {}) }}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
