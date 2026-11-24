import { request } from 'node:http';
import { log } from '../util/log.js';

const SOCKET = '/.sprite/api.sock';

function taskRequest(method: 'PUT' | 'DELETE', name: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const body = method === 'PUT' ? JSON.stringify({ expire: '5m' }) : '';
    const req = request(
      {
        socketPath: SOCKET,
        method,
        path: `/v1/tasks/${encodeURIComponent(name)}`,
        headers: {
          Host: 'sprite',
          ...(body
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
            : {}),
        },
      },
      (response) => {
        response.resume();
        response.on('end', () => resolve(response.statusCode ?? 0));
      },
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

export async function withTaskHold<T>(name: string, work: () => Promise<T>): Promise<T> {
  const taskName = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const acquired = await taskRequest('PUT', taskName);
  if (acquired !== 200 && acquired !== 201)
    throw new Error(`Task hold failed with HTTP ${acquired}`);
  const heartbeat = setInterval(() => {
    void taskRequest('PUT', taskName).catch((error: unknown) => {
      log.warn(
        { event: 'task_heartbeat_failed', name: taskName },
        error instanceof Error ? error.message : String(error),
      );
    });
  }, 60_000);
  heartbeat.unref();
  try {
    return await work();
  } finally {
    clearInterval(heartbeat);
    try {
      await taskRequest('DELETE', taskName);
    } catch (error) {
      log.warn(
        { event: 'task_release_failed', name: taskName },
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
