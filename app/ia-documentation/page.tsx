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
          {/* Breadcrumb renders inside the workspace itself, sharing a row
              with the action panel (Edit/Zoom/Export/Co-pilot) -- those
              buttons depend on state that lives in the workspace component,
              so the whole row moved there rather than trying to lift that
              state up into this page or reach for a portal. */}
          <IaDocumentationWorkspace />
        </main>
      </div>
    </div>
  );
}
