import { resolve } from 'path';
import { mergeConfig, defineConfig } from 'vite';
import { crx, ManifestV3Export } from '@crxjs/vite-plugin';
import baseConfig, { baseManifest, baseBuildOptions } from './vite.config.base'

const outDir = resolve(__dirname, 'dist_chrome');

export default mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [
      crx({
        manifest: {
          ...baseManifest,
          mime_types_handler: {
            'application/pdf': {
              handler_url: 'src/pages/pdf/index.html',
              can_embed: false,
            },
          },
          background: {
            service_worker: 'src/pages/background/index.ts',
            type: 'module'
          },
        } as unknown as ManifestV3Export,
        browser: 'chrome',
        contentScripts: {
          injectCss: true,
        }
      })
    ],
    build: {
      ...baseBuildOptions,
      outDir,
      rollupOptions: {
        input: {
          offscreen: resolve(__dirname, 'src/pages/offscreen/index.html'),
          pdf: resolve(__dirname, 'src/pages/pdf/index.html'),
        },
      },
    },
  })
)
