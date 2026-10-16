import { notFound } from "next/navigation";
import { AutonomousAgents3DLabTool } from "@/features/autonomous-agents-3d-lab/autonomous-agents-3d-lab-tool";
import { MeshStrata3DTool } from "@/features/mesh-strata-3d/mesh-strata-3d-tool";
import { SecurityGrid3DTool } from "@/features/security-grid-3d/security-grid-3d-tool";
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
    case "mesh-strata-3d":
      return <MeshStrata3DTool />;
    case "security-grid-3d":
      return <SecurityGrid3DTool />;
    case "autonomous-agents-3d-lab":
      return <AutonomousAgents3DLabTool />;
  }
}
