import { Search, Sparkles } from "lucide-react";

export function TopNav() {
  return (
    <header className="flex h-[60px] items-center justify-between border-b border-black/5 bg-surface px-6">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">
          <Sparkles size={18} />
        </div>
        <span className="text-[15px] font-semibold text-ink">Agent Hub</span>
      </div>

      <div className="flex h-[37px] w-[420px] items-center gap-2 rounded-lg border border-black/10 bg-panel px-3">
        <Search size={16} className="text-muted" />
        <input
          className="w-full bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
          placeholder="Search agents…"
        />
      </div>

      <div className="flex items-center gap-3">
        <button className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover">
          Upgrade
        </button>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-panel text-xs font-semibold text-ink">
          JD
        </div>
      </div>
    </header>
  );
}
