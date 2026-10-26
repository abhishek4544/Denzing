import { readFile, mkdir, writeFile } from 'node:fs/promises';

// Explicit allowlist: no environment files, git data, or editor internals.
const files = {};
const securityGridSources = ['scene.tsx', 'defaults.ts'];
for (const source of securityGridSources) {
  files[`src/security-grid-3d/${source}`] = await readFile(`features/security-grid-3d/${source}`, 'utf8');
}
const labSources = ['embed.tsx', 'viewer.tsx', 'scene.tsx', 'defaults.ts'];
for (const source of labSources) {
  files[`src/autonomous-agents-3d-lab/${source}`] = await readFile(`features/autonomous-agents-3d-lab/${source}`, 'utf8');
}
// Strip embedded base64 textures from the baked defaults — users receive their
// current settings in settings.json; defaults only serve as a type-level shell.
const stripTextures = (data) => {
  const next = { ...data };
  if (Array.isArray(next.cubeSlabTextures)) next.cubeSlabTextures = next.cubeSlabTextures.map(() => '');
  return next;
};
const securityPreset = JSON.parse(await readFile('features/security-grid-3d/preset-default.json', 'utf8'));
files['src/security-grid-3d/preset-default.json'] = JSON.stringify(stripTextures(securityPreset), null, 2);
const labPreset = JSON.parse(await readFile('features/autonomous-agents-3d-lab/preset-default.json', 'utf8'));
if (labPreset.settings) labPreset.settings = stripTextures(labPreset.settings);
files['src/autonomous-agents-3d-lab/preset-default.json'] = JSON.stringify(labPreset, null, 2);
const project = JSON.parse(await readFile('package.json', 'utf8'));
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const runtime = ['react', 'react-dom', 'three', '@react-three/fiber', '@react-three/drei', '@react-three/postprocessing'];
const types = ['typescript', '@types/react', '@types/react-dom', '@types/three'];
const version = (name) => lock.packages[`node_modules/${name}`]?.version ?? project.dependencies[name] ?? project.devDependencies[name];
files['package.json'] = JSON.stringify({ name: 'autonomous-agents-lab-website', version: '1.0.0', private: true,
  type: 'module', engines: { node: '^20.19.0 || >=22.12.0' },
  scripts: { dev: 'vite', build: 'tsc --noEmit && vite build', preview: 'vite preview' },
  dependencies: Object.fromEntries(runtime.map((name) => [name, version(name)])),
  devDependencies: { ...Object.fromEntries(types.map((name) => [name, version(name)])), vite: '8.3.1', '@types/node': version('@types/node') },
}, null, 2);
files['tsconfig.json'] = JSON.stringify({ compilerOptions: { target: 'ES2022', lib: ['ES2022', 'DOM', 'DOM.Iterable'],
  module: 'ESNext', moduleResolution: 'Bundler', jsx: 'react-jsx', strict: true, skipLibCheck: true,
  esModuleInterop: true, resolveJsonModule: true, noEmit: true }, include: ['src'] }, null, 2);
files['vite.config.ts'] = `import { defineConfig } from 'vite';
export default defineConfig({ oxc: { jsx: { runtime: 'automatic' } } });\n`;
files['index.html'] = '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Autonomous Agents Lab</title></head><body style="margin:0"><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>';
files['src/main.tsx'] = `import { createRoot } from 'react-dom/client';
import { AutonomousAgentsLabEmbed } from './autonomous-agents-3d-lab/embed';
import type { AutonomousAgentsLabSettings } from './autonomous-agents-3d-lab/defaults';
import settings from './settings.json';
import camera from './camera.json';

createRoot(document.getElementById('root')!).render(
  <AutonomousAgentsLabEmbed settings={settings as AutonomousAgentsLabSettings}
    initialCamera={{ ...camera, position: camera.position as [number, number, number], target: camera.target as [number, number, number] }}
    style={{ height: '100dvh' }} />
);\n`;
files['.gitignore'] = 'node_modules/\ndist/\n';
files['README.md'] = `# Autonomous Agents Lab website

This is a runnable React + TypeScript + Vite project with your exported settings and camera view. It includes the optimized renderer, without the editor or video encoder.

## Run

Use Node 22.12+ (or Node 20.19+).

\`\`\`sh
npm install
npm run dev
\`\`\`

Build with \`npm run build\`. Publish the \`dist\` directory to a static host, or preview it with \`npm run preview\`.

## Use in an existing React website

Copy \`src/autonomous-agents-3d-lab\`, \`src/security-grid-3d\`, \`src/settings.json\`, and \`src/camera.json\` into your app. Install the runtime dependencies listed in package.json. Import \`AutonomousAgentsLabEmbed\` as demonstrated in \`src/main.tsx\` and give it a container with a nonzero height.

Use \`maxDpr={1}\` for lower GPU usage or \`maxDpr={2}\` for sharper rendering (default 1.5). Set \`interactive\` to enable orbit gestures; default gestures are off so the illustration does not capture page scrolling. Auto rotation follows your settings. The renderer loads near the viewport and pauses offscreen or when the tab is hidden.

For non-Vite bundlers, configure JSX. This project uses no Next.js APIs or Tailwind styles. Installed packages retain their own licenses.
`;
await mkdir('public/exports', { recursive: true });
await writeFile('public/exports/autonomous-agents-template.json', JSON.stringify({ version: 1, files }));
console.log('Built Autonomous Agents Lab code export template.');
