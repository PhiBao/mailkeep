import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Context, Handler } from 'hono';

const DIST = path.resolve(fileURLToPath(new URL('../../../../web/dist/', import.meta.url)));
const INDEX = path.join(DIST, 'index.html');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
};

async function sendFile(c: Context, filePath: string): Promise<Response> {
  const data = await readFile(filePath);
  const extension = path.extname(filePath).toLowerCase();
  c.header('Content-Type', MIME[extension] ?? 'application/octet-stream');
  c.header(
    'Cache-Control',
    extension === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  );
  return c.body(new Uint8Array(data));
}

export const staticHandler: Handler = async (c) => {
  let pathname: string;
  try {
    pathname = decodeURIComponent(c.req.path);
  } catch {
    return c.text('Bad request', 400);
  }

  const relative = pathname.replace(/^\/+/, '');
  let filePath = path.resolve(DIST, relative || 'index.html');
  if (filePath !== DIST && !filePath.startsWith(`${DIST}${path.sep}`)) {
    return c.notFound();
  }

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = path.join(filePath, 'index.html');
    return await sendFile(c, filePath);
  } catch {
    if (!path.extname(relative)) {
      try {
        return await sendFile(c, INDEX);
      } catch {
        return c.notFound();
      }
    }
    return c.notFound();
  }
};
