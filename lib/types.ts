export interface RepoIconMatch {
  name: string;
  fileName: string;
  svg: string;
}

export interface AgentGenerateResponse {
  raw: unknown;
  svgs: string[];
}

export type IconSizeKey = "xs" | "s" | "m" | "l" | "xl";
export type IconStateKey = "default" | "hover" | "active" | "disabled";

export interface IconStyleConfig {
  size: IconSizeKey;
  color: string;
  states: IconStateKey[];
}

export const ICON_SIZE_PX: Record<IconSizeKey, number> = {
  xs: 16,
  s: 20,
  m: 24,
  l: 32,
  xl: 48,
};

export const ICON_SIZE_LABEL: Record<IconSizeKey, string> = {
  xs: "XS",
  s: "S",
  m: "M",
  l: "L",
  xl: "XL",
};

export const ICON_STATE_LABEL: Record<IconStateKey, string> = {
  default: "Default",
  hover: "Hover",
  active: "Active",
  disabled: "Disabled",
};

export const COLOR_SWATCHES = [
  "#1c1c1e",
  "#ffffff",
  "#a3a3a3",
  "#3b82f6",
  "#10b981",
  "#ef4444",
  "#8b5cf6",
  "#f59e0b",
];
