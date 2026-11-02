import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { Plugin } from 'vite';

export function cfmPreview(
  sampleFile: string,
  headers: Record<string, string>,
): Plugin {
  return {
    name: 'actual-cfm-ui-preview',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url || '/', 'http://localhost')
          .pathname;
        if (
          pathname === '/__cfm-preview' ||
          pathname === '/__cfm-preview/sample.zip'
        ) {
          for (const [name, value] of Object.entries(headers)) {
            response.setHeader(name, value);
          }
        }
        try {
          if (pathname === '/__cfm-preview') {
            const source = await readFile(
              path.join(server.config.root, 'preview/index.html'),
              'utf8',
            );
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            response.setHeader('Cache-Control', 'no-store');
            response.end(await server.transformIndexHtml(pathname, source));
          } else if (pathname === '/__cfm-preview/sample.zip') {
            response.setHeader('Content-Type', 'application/zip');
            response.setHeader('Cache-Control', 'no-store');
            response.end(await readFile(sampleFile));
          } else {
            next();
          }
        } catch (error) {
          next(error);
        }
      });
    },
  };
}
