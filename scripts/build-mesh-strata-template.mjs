import { readFile, mkdir, writeFile } from 'node:fs/promises';

// Explicit allowlist: no environment files, git data, or editor internals.
const sources = ['embed.tsx', 'viewer.tsx', 'scene.tsx', 'defaults.ts',
  'foundation-batch.tsx', 'layer-name-label.tsx', 'renderer-diagnostics.tsx'];
const files = {};
for (const source of sources) {
  files[`src/mesh-strata/${source}`] = await readFile(`features/mesh-strata-3d/${source}`, 'utf8');
}
files['public/fonts/VioletSans-OFL.txt'] = await readFile('public/fonts/VioletSans-OFL.txt', 'utf8');
const project = JSON.parse(await readFile('package.json', 'utf8'));
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const runtime = ['react', 'react-dom', 'three', '@react-three/fiber', '@react-three/drei', '@react-three/postprocessing'];
const types = ['typescript', '@types/react', '@types/react-dom', '@types/three'];
const version = (name) => lock.packages[`node_modules/${name}`]?.version ?? project.dependencies[name] ?? project.devDependencies[name];
files['package.json'] = JSON.stringify({ name: 'mesh-strata-website', version: '1.0.0', private: true,
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
files['index.html'] = '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mesh Strata</title></head><body style="margin:0"><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>';
files['src/main.tsx'] = `import { createRoot } from 'react-dom/client';
import { MeshStrataEmbed } from './mesh-strata/embed';
import type { StrataSettings } from './mesh-strata/defaults';
import settings from './settings.json';
import camera from './camera.json';

createRoot(document.getElementById('root')!).render(
  <MeshStrataEmbed settings={settings as StrataSettings}
    initialCamera={{ ...camera, position: camera.position as [number, number, number], target: camera.target as [number, number, number] }}
    style={{ height: '100dvh' }} />
);\n`;
files['.gitignore'] = 'node_modules/\ndist/\n';
files['README.md'] = `# Mesh Strata website

This is a runnable React + TypeScript + Vite project with your exported settings and camera view. It includes the optimized renderer and Violet Sans font, without the editor or video encoder.

## Run

Use Node 22.12+ (or Node 20.19+).

\`\`\`sh
npm install
npm run dev
\`\`\`

Build with \`npm run build\`. Publish the \`dist\` directory to a static host, or preview it with \`npm run preview\`.

## Use in an existing React website

Copy \`src/mesh-strata\`, \`src/settings.json\`, and \`src/camera.json\` into your app. Copy \`public/fonts\` into the site's public assets. Install the runtime dependencies listed in package.json. Import \`MeshStrataEmbed\` as demonstrated in \`src/main.tsx\` and give it a container with a nonzero height.

Use \`maxDpr={1}\` for lower GPU usage or \`maxDpr={2}\` for sharper rendering (default 1.5). Set \`interactive\` to enable orbit gestures; default gestures are off so the illustration does not capture page scrolling. Auto rotation follows your settings. The renderer loads near the viewport and pauses offscreen or when the tab is hidden.

The font is served from \`/fonts/VioletSans-Regular.woff2\`; update that path in layer-name-label.tsx if your host uses a subdirectory. Optional frame-glass environment presets use Drei's remote HDR assets, so self-host those if your site must run completely offline.

For non-Vite bundlers, configure JSX and replace \`process.env.NODE_ENV\` using the bundler's normal production setting. This project uses no Next.js APIs or Tailwind styles. Font licensing is included in public/fonts; installed packages retain their own licenses.
`;
await mkdir('public/exports', { recursive: true });
await writeFile('public/exports/mesh-strata-template.json', JSON.stringify({ version: 1, files,
  font: (await readFile('public/fonts/VioletSans-Regular.woff2')).toString('base64') }));
console.log('Built Mesh Strata code export template.');
