"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Grid2x2,
  Palette,
  MessageSquare,
  Image as ImageIcon,
  Code2,
  BarChart3,
  Settings,
  Sparkles,
  Layers,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const CATEGORIES = [
  { label: "All Agents", icon: Grid2x2 },
  { label: "Design Tools", icon: Palette },
  { label: "Content & Copy", icon: MessageSquare },
  { label: "Image & Vision", icon: ImageIcon },
  { label: "Code & Dev", icon: Code2 },
  { label: "Productivity", icon: Layers },
  { label: "Analytics", icon: BarChart3 },
];

const MY_AGENTS = [
  { label: "Icon Generator", icon: Sparkles, active: true },
  { label: "Brand Palette AI", icon: Palette },
  { label: "Layout Composer", icon: Layers },
];

export function GeneratorSidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`relative flex shrink-0 flex-col border-r border-black/5 bg-surface py-6 transition-[width] duration-150 ${
        collapsed ? "w-[60px] px-2" : "w-[220px] px-4"
      }`}
    >
      <button
        onClick={() => setCollapsed((v) => !v)}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute -right-3 top-8 flex h-6 w-6 items-center justify-center rounded-full border border-black/10 bg-surface text-muted shadow-sm hover:text-ink"
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {!collapsed && (
        <p className="mb-3 px-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Categories
        </p>
      )}
      <nav className="flex flex-col gap-1">
        {CATEGORIES.map(({ label, icon: Icon }) =>
          label === "All Agents" ? (
            <Link
              key={label}
              href="/"
              title={collapsed ? label : undefined}
              className={`flex items-center gap-3 rounded-lg py-2 text-sm text-ink hover:bg-panel ${
                collapsed ? "justify-center px-0" : "px-2"
              }`}
            >
              <Icon size={18} className="shrink-0 text-muted" />
              {!collapsed && label}
            </Link>
          ) : (
            <button
              key={label}
              title={collapsed ? label : undefined}
              className={`flex items-center gap-3 rounded-lg py-2 text-sm text-ink hover:bg-panel ${
                collapsed ? "justify-center px-0" : "px-2"
              }`}
            >
              <Icon size={18} className="shrink-0 text-muted" />
              {!collapsed && label}
            </button>
          )
        )}
      </nav>

      <div className="my-4 h-px bg-black/10" />

      {!collapsed && (
        <p className="mb-3 px-2 text-xs font-semibold uppercase tracking-wide text-muted">
          My Agents
        </p>
      )}
      <nav className="flex flex-col gap-1">
        {MY_AGENTS.map(({ label, icon: Icon, active }) => (
          <button
            key={label}
            title={collapsed ? label : undefined}
            className={`flex items-center gap-3 rounded-lg py-2 text-sm hover:bg-panel ${
              collapsed ? "justify-center px-0" : "px-2"
            } ${active ? "bg-panel font-medium text-brand" : "text-ink"}`}
          >
            <Icon size={18} className={`shrink-0 ${active ? "text-brand" : "text-muted"}`} />
            {!collapsed && label}
          </button>
        ))}
      </nav>

      <div className="mt-auto">
        <button
          title={collapsed ? "Settings" : undefined}
          className={`flex items-center gap-3 rounded-lg py-2 text-sm text-ink hover:bg-panel ${
            collapsed ? "justify-center px-0" : "px-2"
          }`}
        >
          <Settings size={18} className="shrink-0 text-muted" />
          {!collapsed && "Settings"}
        </button>
      </div>
    </aside>
  );
}
