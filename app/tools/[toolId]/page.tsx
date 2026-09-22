import { notFound } from "next/navigation";
import { OntologyExplorer3DTool } from "@/features/ontology-explorer-3d/ontology-explorer-3d-tool";
import { getTool, tools } from "@/features/tool-registry";

type ToolPageProps = {
  params: Promise<{ toolId: string }>;
};

export function generateStaticParams() {
  return tools.map((tool) => ({ toolId: tool.id }));
}

export default async function ToolPage({ params }: ToolPageProps) {
  const { toolId } = await params;
  const tool = getTool(toolId);

  if (!tool) notFound();

  switch (tool.id) {
    case "ontology-explorer-3d":
      return <OntologyExplorer3DTool />;
  }
}
