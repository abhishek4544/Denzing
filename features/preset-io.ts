export type PresetFile<T> = {
  tool: string;
  version: number;
  settings: T;
};

export function downloadPreset<T>(tool: string, settings: T) {
  const payload: PresetFile<T> = { tool, version: 1, settings };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  link.href = url;
  link.download = `${tool}-preset-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function pickPresetFile<T>(
  expectedTool: string,
  onLoad: (settings: T) => void,
  onError?: (message: string) => void,
) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as PresetFile<T>;
        if (!parsed || typeof parsed !== "object" || !("settings" in parsed)) {
          throw new Error("Missing settings field.");
        }
        if (parsed.tool && parsed.tool !== expectedTool) {
          throw new Error(
            `Preset is for "${parsed.tool}" but this tool is "${expectedTool}".`,
          );
        }
        onLoad(parsed.settings);
      } catch (err) {
        onError?.(err instanceof Error ? err.message : String(err));
      }
    };
    reader.readAsText(file);
  });
  input.click();
}
