import Link from "next/link";
import { Star, Sparkles, Palette, Layers } from "lucide-react";
import { TopNav } from "@/components/TopNav";
import { HubSidebar } from "@/components/HubSidebar";

const FEATURED = [
  {
    icon: Sparkles,
    name: "✦ Icon Generator",
    description: "Generate production-ready icon sets from text prompts. SVG & PNG export.",
    usedBy: "Used by 4 people",
    cta: "Go to workspace",
    href: "/icon-generator",
  },
  {
    icon: Palette,
    name: "IA Documentation",
    description: "Extract and generate complete color systems from any inspiration.",
    usedBy: "Used by 13 people",
    cta: "Go to workspace",
    href: "/ia-documentation",
  },
  {
    icon: Layers,
    name: "Layout Composer",
    description: "Auto-generate wireframes and layout suggestions from briefs.",
    usedBy: "Used by 13 people",
    cta: "Add to workspace",
    href: "#",
  },
];

const ALL_AGENTS = [
  { name: "Copy Writer AI", description: "Generate UI copy in seconds" },
  { name: "Motion Generator", description: "Auto-animates your Figma layers" },
  { name: "Accessibility Checker", description: "WCAG color contrast analysis" },
  { name: "Font Pairing", description: "Suggests right typography" },
  { name: "Asset Resizer", description: "Batch resize assets for web" },
  { name: "Mockup Generator", description: "Device mockups in one click" },
  { name: "Design Reviewer", description: "Automated design feedback" },
  { name: "Color Extractor", description: "Extract colors from images" },
];

export default function AgentHubPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <TopNav />
      <div className="flex flex-1">
        <HubSidebar />
        <main className="flex-1 px-8 py-8">
          {/* Hero Banner */}
          <div className="relative flex items-center justify-between overflow-hidden rounded-2xl bg-brand px-10 py-10 text-white">
            <div>
              <h1 className="text-2xl font-semibold">Supercharge your design workflow</h1>
              <p className="mt-2 text-white/80">Discover AI agents built for designers</p>
              <Link
                href="/icon-generator"
                className="mt-5 inline-block rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-brand"
              >
                Browse Featured
              </Link>
            </div>
            <Link
              href="/icon-generator"
              className="hidden w-64 shrink-0 rounded-xl bg-white p-5 text-ink shadow-lg md:block"
            >
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-[#eef2ff] text-brand">
                <Sparkles size={18} />
              </div>
              <p className="font-semibold">Icon Generator</p>
              <p className="text-sm text-muted">Generate SVG icons in seconds</p>
            </Link>
          </div>

          {/* Featured Agents */}
          <div className="mt-10">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">Featured Agents</h2>
              <Link href="#" className="text-sm font-medium text-brand">
                See all →
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {FEATURED.map(({ icon: Icon, name, description, usedBy, cta, href }) => (
                <div key={name} className="flex flex-col rounded-2xl bg-surface p-5 shadow-sm">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-[#eef2ff] text-brand">
                    <Icon size={18} />
                  </div>
                  <p className="font-semibold text-ink">{name}</p>
                  <p className="mt-1 flex-1 text-sm text-muted">{description}</p>
                  <div className="mt-3 flex items-center gap-1 text-xs text-ink">
                    <Star size={12} className="fill-current text-amber-400" />
                    {usedBy}
                  </div>
                  <Link
                    href={href}
                    className="mt-4 rounded-lg bg-brand px-4 py-2 text-center text-sm font-medium text-white hover:bg-brand-hover"
                  >
                    {cta}
                  </Link>
                </div>
              ))}
            </div>
          </div>

          {/* All Agents */}
          <div className="mt-10">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">All Agents</h2>
              <span className="text-sm text-muted">Sort: Most Popular</span>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {ALL_AGENTS.map(({ name, description }) => (
                <div key={name} className="rounded-2xl bg-surface p-4 shadow-sm">
                  <div className="mb-3 h-9 w-9 rounded-lg bg-panel" />
                  <p className="text-sm font-semibold text-ink">{name}</p>
                  <p className="mt-1 text-xs text-muted">{description}</p>
                  <button className="mt-3 rounded-lg bg-panel px-3 py-1.5 text-xs font-medium text-brand">
                    Add
                  </button>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
