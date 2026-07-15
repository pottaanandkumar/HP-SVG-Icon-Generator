import { TopNav } from "@/components/TopNav";
import { GeneratorSidebar } from "@/components/GeneratorSidebar";
import { IaDocumentationWorkspace } from "@/components/IaDocumentationWorkspace";

export default function IaDocumentationPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <TopNav />
      <div className="flex flex-1">
        <GeneratorSidebar />
        <main className="min-w-0 flex-1 px-8 py-8">
          <div className="mb-4 flex items-center gap-2 text-sm text-muted">
            <span>All Agents</span>
            <span>/</span>
            <span className="text-ink">IA Documentation</span>
          </div>
          <IaDocumentationWorkspace />
        </main>
      </div>
    </div>
  );
}
