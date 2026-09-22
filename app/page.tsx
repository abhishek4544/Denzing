import { redirect } from "next/navigation";
import { defaultTool } from "@/features/tool-registry";

export default function Home() {
  redirect(defaultTool.href);
}
