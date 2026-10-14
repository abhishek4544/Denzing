import { defaultStrataSettings, canvasAspectOptions, contentTypeOptions, frameShapeOptions, frameColorPresets, glassEnvOptions, layerConceptOptions, MAX_LAYERS, type StrataSettings } from "./defaults";

/** Validate imported data before it reaches geometry allocation or shader uniforms. */
export function validateStrataPreset(input: unknown): StrataSettings {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Settings must be an object.");
  const data = input as Record<string, unknown>;
  const result = { ...defaultStrataSettings } as Record<string, unknown>;
  const enums: Record<string, readonly string[]> = {
    canvasAspect: canvasAspectOptions.map((x) => x.value),
    frameShape: frameShapeOptions.map((x) => x.value),
    frameColorPreset: frameColorPresets.map((x) => x.value),
    frameGlassEnv: glassEnvOptions.map((x) => x.value),
    interlayerStyle: ["strings", "fan"],
    layerConcept: [...layerConceptOptions.map((x) => x.value), "data", "ontology", "logic", "orchestration", "outputs"],
    layerContent: contentTypeOptions.map((x) => x.value),
  };
  for (const [key, fallback] of Object.entries(defaultStrataSettings)) {
    if (!(key in data)) continue;
    const value = data[key];
    const valid = (item: unknown, example: unknown) => {
      if (["layerSparkleHeight", "interlayerWiresPerHubByPair", "interlayerEnabledByPair"].includes(key) && item === null) return true;
      if (enums[key]) return typeof item === "string" && enums[key].includes(item);
      if (example === null) return item === null || (key === "interlayerEnabledByPair" ? typeof item === "boolean" : typeof item === "number" && Number.isFinite(item));
      if (typeof item !== typeof example) return false;
      if (typeof item === "number") return Number.isFinite(item) && Math.abs(item) <= 10000;
      if (typeof item === "string" && typeof example === "string" && example.startsWith("#")) return /^#[\da-f]{6}$/i.test(item);
      return true;
    };
    if (Array.isArray(fallback)) {
      if (!Array.isArray(value) || value.length > fallback.length || !value.every((item, index) => valid(item, fallback[index]))) throw new Error(`Invalid ${key} values.`);
      result[key] = fallback.map((item, index) => index < value.length ? value[index] : item);
    } else {
      if (!valid(value, fallback)) throw new Error(`Invalid ${key} value.`);
      result[key] = value;
    }
  }
  if (!Number.isInteger(result.layerCount) || Number(result.layerCount) < 2 || Number(result.layerCount) > MAX_LAYERS) throw new Error(`Layer count must be between 2 and ${MAX_LAYERS}.`);
  const allocationLimits: Record<string, [number, number]> = { segments: [12, 80], agentGridN: [4, 32], terrainGridN: [30, 140], cloudDensity: [16, 200], foundationCount: [1, 28] };
  for (const [key, [min, max]] of Object.entries(allocationLimits)) {
    const value = Number(result[key]);
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${key} must be between ${min} and ${max}.`);
  }
  return result as StrataSettings;
}
