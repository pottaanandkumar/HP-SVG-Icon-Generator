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
  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-black/5 bg-surface px-4 py-6">
      <p className="mb-3 px-2 text-xs font-semibold uppercase tracking-wide text-muted">
        Categories
      </p>
      <nav className="flex flex-col gap-1">
        {CATEGORIES.map(({ label, icon: Icon }) => (
          <button
            key={label}
            className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-ink hover:bg-panel"
          >
            <Icon size={18} className="text-muted" />
            {label}
          </button>
        ))}
      </nav>

      <div className="my-4 h-px bg-black/10" />

      <p className="mb-3 px-2 text-xs font-semibold uppercase tracking-wide text-muted">
        My Agents
      </p>
      <nav className="flex flex-col gap-1">
        {MY_AGENTS.map(({ label, icon: Icon, active }) => (
          <button
            key={label}
            className={`flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-panel ${
              active ? "bg-panel font-medium text-brand" : "text-ink"
            }`}
          >
            <Icon size={18} className={active ? "text-brand" : "text-muted"} />
            {label}
          </button>
        ))}
      </nav>

      <div className="mt-auto">
        <button className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-ink hover:bg-panel">
          <Settings size={18} className="text-muted" />
          Settings
        </button>
      </div>
    </aside>
  );
}
