import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { GeneratorSidebar } from "@/components/GeneratorSidebar";
import { IconGeneratorWorkspace } from "@/components/IconGeneratorWorkspace";

export default function IconGeneratorPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <TopNav />
      <div className="flex flex-1">
        <GeneratorSidebar />
        <main className="flex-1 px-8 py-8">
          <div className="mb-6 flex items-center gap-2 text-sm text-muted">
            <Link href="/" className="hover:text-ink hover:underline">
              All Agents
            </Link>
            <span>/</span>
            <span className="text-ink">Icon Generator</span>
          </div>
          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-ink">Icon Generator</h1>
            <p className="mt-1 text-sm text-muted">
              Search the HP icon repo by name, or let the research agent design one from scratch.
            </p>
          </div>
          <IconGeneratorWorkspace />
        </main>
      </div>
    </div>
  );
}
