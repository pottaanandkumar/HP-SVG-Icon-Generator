import { Grid2x2, Sparkles, Palette, LayoutGrid, Settings } from "lucide-react";

const NAV_ITEMS = [
  { label: "All Agents", icon: Grid2x2 },
  { label: "Design Tools", icon: Palette },
  { label: "Icon Generator", icon: Sparkles },
];

const INSTALLED = ["Icon Generator", "Brand Palette AI", "Layout Composer"];

export function HubSidebar() {
  return (
    <aside className="flex w-20 shrink-0 flex-col items-center gap-6 border-r border-black/5 bg-surface py-6">
      <nav className="flex flex-col items-center gap-1">
        {NAV_ITEMS.map(({ label, icon: Icon }) => (
          <button
            key={label}
            title={label}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-muted hover:bg-panel hover:text-ink"
          >
            <Icon size={18} />
          </button>
        ))}
      </nav>

      <div className="h-px w-8 bg-black/10" />

      <div className="flex flex-col items-center gap-1">
        {INSTALLED.map((label) => (
          <button
            key={label}
            title={label}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-muted hover:bg-panel hover:text-ink"
          >
            <LayoutGrid size={18} />
          </button>
        ))}
      </div>

      <div className="mt-auto">
        <button
          title="Settings"
          className="flex h-11 w-11 items-center justify-center rounded-xl text-muted hover:bg-panel hover:text-ink"
        >
          <Settings size={18} />
        </button>
      </div>
    </aside>
  );
}
