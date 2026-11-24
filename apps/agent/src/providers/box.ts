import { z } from 'zod';
import type { GatewayClient } from '../gateway/client.js';

const userSchema = z.object({ id: z.string(), name: z.string(), login: z.string() });
const folderSchema = z.object({ id: z.string(), type: z.literal('folder'), name: z.string() });
const fileSchema = z.object({
  id: z.string(),
  type: z.literal('file'),
  name: z.string(),
  file_version: z.object({ id: z.string() }).optional(),
});
const itemsSchema = z.object({
  entries: z.array(z.union([folderSchema, fileSchema])),
});
const collectionSchema = z.object({ entries: z.array(fileSchema).min(1) });

export async function getMe(client: GatewayClient) {
  const response = await client.request('box', 'GET', '/2.0/users/me');
  return userSchema.parse(response.json);
}

export async function createFolder(
  client: GatewayClient,
  input: { name: string; parentId: string },
) {
  const response = await client.request('box', 'POST', '/2.0/folders', {
    json: { name: input.name, parent: { id: input.parentId } },
  });
  return folderSchema.parse(response.json);
}

export async function listItems(client: GatewayClient, folderId: string) {
  const response = await client.request('box', 'GET', `/2.0/folders/${folderId}/items`);
  return itemsSchema.parse(response.json);
}

export async function uploadFile(
  client: GatewayClient,
  input: { folderId: string; name: string; bytes: Buffer; contentType: string },
) {
  const form = new FormData();
  form.append('attributes', JSON.stringify({ name: input.name, parent: { id: input.folderId } }));
  form.append('file', new Blob([input.bytes], { type: input.contentType }), input.name);
  const response = await client.request('box', 'POST', '/upload/files/content', { body: form });
  return collectionSchema.parse(response.json);
}

export async function uploadNewVersion(
  client: GatewayClient,
  input: { fileId: string; name: string; bytes: Buffer; contentType: string },
) {
  const form = new FormData();
  form.append('file', new Blob([input.bytes], { type: input.contentType }), input.name);
  const response = await client.request('box', 'POST', `/upload/files/${input.fileId}/content`, {
    body: form,
  });
  return collectionSchema.parse(response.json);
}
