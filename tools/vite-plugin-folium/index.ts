import { resolve, sep } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import { generateModule } from './codegen.ts';
import { scanLibrary, type ScanResult } from './scan.ts';
import { formatIssue } from './validate.ts';

export type { LibraryManifest, LoadableBook, Book, CategoryNode } from './types.ts';

export const VIRTUAL_ID = 'virtual:folium-library';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

export interface FoliumPluginOptions {
  /** Library folder, relative to the project root. Default: "Library". */
  libraryDir?: string;
  /** Global config file, relative to the project root. Default: "folium.config.json". */
  configFile?: string;
}

/**
 * Discovers the Markdown books in `Library/` and exposes them as the virtual module
 * `virtual:folium-library` (a typed manifest of books and categories).
 */
export default function folium(options: FoliumPluginOptions = {}): Plugin {
  let root = process.cwd();
  let libraryDir = resolve(root, options.libraryDir ?? 'Library');
  let configFile = resolve(root, options.configFile ?? 'folium.config.json');
  let isBuild = false;
  let cache: ScanResult | undefined;
  let warned = false;

  function scan(): ScanResult {
    if (!cache) {
      cache = scanLibrary({ libraryDir, configFile, root });
      warned = false;
    }
    return cache;
  }

  /** Logs warnings once per scan; throws (via the Rollup context) on errors. */
  function report(ctx: { warn(message: string): void; error(message: string): never }, result: ScanResult) {
    if (!warned) {
      warned = true;
      for (const issue of result.issues) if (issue.level === 'warning') ctx.warn(formatIssue(issue));
    }
    const errors = result.issues.filter((i) => i.level === 'error');
    if (errors.length > 0) {
      ctx.error(`Folium found ${errors.length} problem(s) in the library:\n${errors.map(formatIssue).join('\n')}`);
    }
  }

  const isRelevant = (file: string, isDir: boolean) =>
    file === configFile ||
    (file.startsWith(libraryDir + sep) && (isDir || /\.md$/i.test(file) || file.endsWith(`${sep}_folder.json`)));

  return {
    name: 'folium',

    configResolved(config) {
      root = config.root;
      isBuild = config.command === 'build';
      libraryDir = resolve(root, options.libraryDir ?? 'Library');
      configFile = resolve(root, options.configFile ?? 'folium.config.json');
    },

    buildStart() {
      cache = undefined;
      // Fail the production build on invalid content even if no module imports the manifest.
      if (isBuild) report(this, scan());
      for (const file of scan().files) this.addWatchFile(file);
    },

    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined;
    },

    load(id) {
      if (id !== RESOLVED_ID) return undefined;
      const result = scan();
      report(this, result);
      for (const file of result.files) this.addWatchFile(file);
      return generateModule(result.manifest, libraryDir);
    },

    configureServer(server: ViteDevServer) {
      server.watcher.add([libraryDir, configFile]);

      let timer: ReturnType<typeof setTimeout> | undefined;
      const onChange = (isDir: boolean) => (file: string) => {
        if (!isRelevant(resolve(file), isDir)) return;
        cache = undefined;
        clearTimeout(timer);
        timer = setTimeout(() => {
          // Invalidate in every environment (client + ssr), then tell the browser to reload.
          for (const env of Object.values(server.environments)) {
            const mod = env.moduleGraph.getModuleById(RESOLVED_ID);
            if (mod) env.moduleGraph.invalidateModule(mod);
          }
          server.hot.send({ type: 'full-reload' });
        }, 50);
      };

      for (const event of ['add', 'change', 'unlink'] as const) server.watcher.on(event, onChange(false));
      for (const event of ['addDir', 'unlinkDir'] as const) server.watcher.on(event, onChange(true));
    },
  };
}
