import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FIXTURES = path.join(ROOT, 'spikes/gateway/fixtures');
const GATEWAY = 'https://api.sprites.dev/v1/gateway';
const tiny = await readFile(path.join(FIXTURES, 'tiny.jpg'));
const letter = await readFile(path.join(FIXTURES, 'letter.jpg'));

interface CallResult {
  ok: boolean;
  status: number;
  json: unknown;
  text: string;
  ms: number;
}

async function call(
  base: string,
  requestPath: string,
  init: RequestInit = {},
  timeoutMs = 30_000,
): Promise<CallResult> {
  const started = performance.now();
  const response = await fetch(new URL(requestPath.replace(/^\/+/, ''), `${base}/`), {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return {
    ok: response.ok,
    status: response.status,
    json,
    text,
    ms: Math.round(performance.now() - started),
  };
}

function jsonBody(value: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  };
}

function sample(value: unknown, limit = 4000): string {
  const text = JSON.stringify(value, null, 2) ?? String(value);
  return text.length > limit ? `${text.slice(0, limit)}\n… truncated` : text;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

const sections: string[] = [];
const outcomes: Array<{ name: string; pass: boolean }> = [];
const notes: string[] = [];

function section(title: string, lines: string[]): void {
  sections.push(`## ${title}\n\n${lines.join('\n\n')}\n`);
}

function finish(name: string, pass: boolean, details: string): void {
  outcomes.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${pass ? '' : ` — ${details}`}`);
}

try {
  const list = await call(GATEWAY, 'list');
  if (!list.ok) throw new Error(`HTTP ${list.status}: ${list.text.slice(0, 300)}`);
  const parsed = object(list.json);
  const connections = Array.isArray(parsed.connections) ? parsed.connections : [];
  const bases = new Map<string, string>();
  for (const connection of connections) {
    const item = object(connection);
    if (typeof item.provider === 'string' && typeof item.gateway_base_url === 'string') {
      bases.set(item.provider, item.gateway_base_url);
      if (
        item.provider === 'custom_api' &&
        object(item.provider_info).base_api_url === 'https://api.agentmail.to'
      ) {
        bases.set('agentmail', item.gateway_base_url);
      }
      if (
        item.provider === 'custom_api' &&
        object(item.provider_info).base_api_url === 'https://api.pinecone.io'
      ) {
        bases.set('pinecone_control', item.gateway_base_url);
      }
    }
  }
  section('Gateway discovery', [
    `- Path: \`GET /v1/gateway/list\``,
    `- Latency: ${list.ms} ms`,
    `- Top-level keys: \`${Object.keys(parsed).join('`, `')}\``,
    `- Connections: ${connections.length}`,
    `- Base URLs:\n${[...bases].map(([provider, base]) => `  - ${provider}: \`${base}\``).join('\n')}`,
    `- Full response:\n\n\`\`\`json\n${sample(list.json, 30_000)}\n\`\`\``,
  ]);
  const required = ['typesafe', 'ollama', 'pinecone', 'pinecone_control', 'box', 'agentmail'];
  const missing = required.filter((provider) => !bases.has(provider));
  finish('gateway', missing.length === 0, `missing ${missing.join(', ')}`);
} catch (error) {
  section('Gateway discovery', [`FAIL: ${String(error)}`]);
  finish('gateway', false, String(error));
  await writeFile(path.join(ROOT, 'spikes/gateway/RESULT.md'), renderResult());
  process.exitCode = 1;
  throw error;
}

async function typesafeSpike(base: string): Promise<void> {
  const quickstart = await call(
    base,
    '/v1/systemone',
    jsonBody({
      model: 'jev-latest',
      state: 'Help! My payouts have been failing for 3 days.',
      questions: {
        is_urgent: { type: 'noul', instructions: 'Does this convey urgency?' },
      },
    }),
  );
  const image = await call(
    base,
    '/v1/systemone',
    {
      ...jsonBody({
        model: 'jev-1.14.0',
        state: { image: 'photo' },
        assets: {
          photo: {
            type: 'image',
            format: 'jpg',
            data_base64: tiny.toString('base64'),
          },
        },
        questions: {
          red_circle: {
            type: 'noul',
            instructions: 'Does `state.image` contain a red circle on a light background?',
          },
        },
      }),
      headers: {
        'Content-Type': 'application/json',
        'TypeSafe-Danger-Zone-Images': 'true',
      },
    },
    120_000,
  );
  const pass = quickstart.ok && image.ok;
  section('TypeSafe', [
    `- Path: \`POST /v1/systemone\``,
    `- Quickstart: HTTP ${quickstart.status}, ${quickstart.ms} ms`,
    `- Image header call: HTTP ${image.status}, ${image.ms} ms; \`TypeSafe-Danger-Zone-Images: true\` ${image.ok ? 'passed' : 'failed'}`,
    `- Quickstart response shape:\n\n\`\`\`json\n${sample(quickstart.json)}\n\`\`\``,
    `- Image response shape:\n\n\`\`\`json\n${sample(image.json)}\n\`\`\``,
  ]);
  finish('typesafe', pass, `quickstart ${quickstart.status}, image ${image.status}`);
}

async function ollamaSpike(base: string): Promise<void> {
  const textBody = {
    model: 'gemma4:31b',
    messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
    stream: false,
    options: { temperature: 0 },
  };
  let text = await call(base, '/api/chat', jsonBody(textBody), 120_000);
  let textPath = '/api/chat';
  if (!text.ok) {
    textPath = '/v1/chat/completions';
    text = await call(
      base,
      textPath,
      jsonBody({ model: 'gemma4:31b', messages: textBody.messages, stream: false, temperature: 0 }),
      120_000,
    );
  }
  const visionBody = {
    model: 'gemma4:31b',
    messages: [
      {
        role: 'user',
        content:
          'Transcribe every word exactly as printed, line by line. Copy names, dates, amounts and phone numbers exactly. Write [unreadable] for anything you cannot read. No commentary.',
        images: [letter.toString('base64')],
      },
    ],
    stream: false,
    options: { temperature: 0 },
  };
  let vision = await call(base, '/api/chat', jsonBody(visionBody), 180_000);
  let visionPath = '/api/chat';
  if (!vision.ok) {
    visionPath = '/v1/chat/completions';
    vision = await call(
      base,
      visionPath,
      jsonBody({
        model: 'gemma4:31b',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: visionBody.messages[0]?.content },
              {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${letter.toString('base64')}` },
              },
            ],
          },
        ],
        stream: false,
        temperature: 0,
      }),
      180_000,
    );
  }
  const textJson = object(text.json);
  const visionJson = object(vision.json);
  const message = object(visionJson.message);
  const transcript = typeof message.content === 'string' ? message.content : '';
  const pass = text.ok && vision.ok && typeof textJson.prompt_eval_count === 'number';
  section('Ollama', [
    `- Text path: \`POST ${textPath}\` — HTTP ${text.status}, ${text.ms} ms`,
    `- Vision path: \`POST ${visionPath}\` — HTTP ${vision.status}, ${vision.ms} ms`,
    `- Text token fields: \`prompt_eval_count=${String(textJson.prompt_eval_count)}\`, \`eval_count=${String(textJson.eval_count)}\``,
    `- Vision token fields: \`prompt_eval_count=${String(visionJson.prompt_eval_count)}\`, \`eval_count=${String(visionJson.eval_count)}\``,
    `- Text response shape:\n\n\`\`\`json\n${sample(text.json, 1800)}\n\`\`\``,
    `- Vision transcript sample:\n\n\`\`\`text\n${transcript.slice(0, 1200) || sample(visionJson, 1800)}\n\`\`\``,
  ]);
  finish('ollama', pass, `text ${text.status}, vision ${vision.status}`);
}

async function pineconeSpike(base: string, controlBase?: string): Promise<void> {
  const indexName = 'mailkeep-letters';
  let indexes = await call(base, '/indexes');
  let index = (object(indexes.json).indexes as unknown[] | undefined)?.find(
    (item) => object(item).name === indexName,
  );
  if (!index) {
    if (!controlBase) throw new Error('Missing Pinecone Custom API control connector');
    const created = await call(controlBase, '/indexes', {
      ...jsonBody({
        name: indexName,
        vector_type: 'dense',
        dimension: 1024,
        metric: 'cosine',
        spec: { serverless: { cloud: 'aws', region: 'us-east-1' } },
        deletion_protection: 'disabled',
      }),
      headers: {
        'Content-Type': 'application/json',
        'X-Pinecone-Api-Version': '2025-10',
      },
    });
    notes.push(
      `Pinecone vector index create via Custom API \`POST /indexes\` with \`X-Pinecone-Api-Version: 2025-10\`: HTTP ${created.status}, ${created.ms} ms.`,
    );
    if (!created.ok) throw new Error(`Create index failed: ${created.text.slice(0, 500)}`);
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      indexes = await call(base, '/indexes');
      index = (object(indexes.json).indexes as unknown[] | undefined)?.find(
        (item) => object(item).name === indexName,
      );
      if (object(object(index).status).ready === true) break;
    }
  }
  const embedded = await call(
    base,
    '/embed',
    jsonBody({
      model: 'llama-text-embed-v2',
      inputs: [
        { text: 'Riverbend Water Utility November bill' },
        { text: 'Past due second notice for water bill' },
      ],
      parameters: { input_type: 'passage', truncate: 'END' },
    }),
  );
  if (!embedded.ok) throw new Error(`Embed failed: ${embedded.text.slice(0, 500)}`);
  const vectors = object(embedded.json).data as Array<Record<string, unknown>> | undefined;
  const values = vectors?.[0]?.values;
  if (!Array.isArray(values) || values.length !== 1024) {
    throw new Error(
      `Unexpected embedding shape: ${vectors?.length} vectors, ${Array.isArray(values) ? values.length : 'no'} dimensions`,
    );
  }
  const upsert = await call(
    base,
    `/indexes/${indexName}/vectors/upsert`,
    jsonBody({
      namespace: 'spike',
      vectors: [
        { id: 'spike-1', values, metadata: { label: 'bill' } },
        { id: 'spike-2', values: vectors?.[1]?.values, metadata: { label: 'second_notice' } },
      ],
    }),
  );
  if (!upsert.ok && upsert.status === 400 && upsert.text.includes('document schema')) {
    throw new Error(
      'Index is a document schema. Recreate mailkeep-letters as a vector/dense index without schema fields; the dedicated connector blocks the Documents API.',
    );
  }
  const query = await call(
    base,
    `/indexes/${indexName}/query`,
    jsonBody({
      namespace: 'spike',
      vector: values,
      topK: 2,
      includeMetadata: true,
    }),
  );
  const deleted = await call(
    base,
    `/indexes/${indexName}/vectors/delete`,
    jsonBody({ namespace: 'spike', deleteAll: true }),
  );
  const matches = object(query.json).matches as unknown[] | undefined;
  const pass = upsert.ok && query.ok && deleted.ok && (matches?.length ?? 0) > 0;
  section('Pinecone', [
    `- Index: \`${indexName}\` (dense, 1024, cosine, serverless aws us-east-1)`,
    `- Control connector: \`${controlBase ?? 'not needed; index already existed'}\``,
    `- Paths: \`POST /embed\`, \`POST /indexes/${indexName}/vectors/upsert\`, \`POST /indexes/${indexName}/query\`, \`POST /indexes/${indexName}/vectors/delete\``,
    `- Embed: HTTP ${embedded.status}, ${embedded.ms} ms, ${vectors?.length} vectors × ${values.length} dimensions`,
    `- Upsert: HTTP ${upsert.status}, ${upsert.ms} ms`,
    `- Query: HTTP ${query.status}, ${query.ms} ms, ${matches?.length ?? 0} matches`,
    `- Delete namespace: HTTP ${deleted.status}, ${deleted.ms} ms`,
    `- Upsert response:\n\n\`\`\`json\n${sample(upsert.json)}\n\`\`\``,
    `- Query response:\n\n\`\`\`json\n${sample(query.json, 2200)}\n\`\`\``,
    `- Delete response:\n\n\`\`\`json\n${sample(deleted.json)}\n\`\`\``,
  ]);
  finish(
    'pinecone',
    pass,
    `upsert ${upsert.status}, query ${query.status}, delete ${deleted.status}`,
  );
}

async function boxSpike(base: string): Promise<void> {
  const me = await call(base, '/2.0/users/me');
  const rootItems = await call(base, '/2.0/folders/0/items');
  const rootEntries = object(rootItems.json).entries as unknown[] | undefined;
  let folder = rootEntries
    ?.map(object)
    .find((item) => item.type === 'folder' && item.name === '_spike');
  let folderStatus = rootItems.status;
  if (!folder) {
    const created = await call(
      base,
      '/2.0/folders',
      jsonBody({ name: '_spike', parent: { id: '0' } }),
    );
    folderStatus = created.status;
    if (!created.ok) throw new Error(`Folder create failed: ${created.text.slice(0, 500)}`);
    folder = object(created.json);
  }
  const folderId = String(folder.id);
  const beforeUpload = await call(base, `/2.0/folders/${folderId}/items`);
  const beforeEntries = object(beforeUpload.json).entries as unknown[] | undefined;
  const existingFile = beforeEntries
    ?.map(object)
    .find((item) => item.type === 'file' && item.name === 'tiny.jpg');
  let upload: CallResult;
  let uploadPath: string;
  if (existingFile) {
    upload = { ok: true, status: 200, json: existingFile, text: '', ms: 0 };
    uploadPath = 'existing tiny.jpg';
  } else {
    const candidates = ['/upload/files/content', '/2.0/files/content', '/api/2.0/files/content'];
    let uploaded: CallResult | undefined;
    let workingPath = '';
    for (const candidate of candidates) {
      const form = new FormData();
      form.append('attributes', JSON.stringify({ name: 'tiny.jpg', parent: { id: folderId } }));
      form.append('file', new Blob([tiny], { type: 'image/jpeg' }), 'tiny.jpg');
      const attempt = await call(base, candidate, { method: 'POST', body: form });
      notes.push(`Box upload candidate ${candidate}: HTTP ${attempt.status}.`);
      if (attempt.ok) {
        uploaded = attempt;
        workingPath = candidate;
        break;
      }
    }
    if (!uploaded) throw new Error('All Box upload paths failed');
    upload = uploaded;
    uploadPath = workingPath;
  }
  const uploadedEntries = object(upload.json).entries as unknown[] | undefined;
  const file = object(uploadedEntries?.[0] ?? upload.json);
  const fileId = String(file.id);
  const versionForm = new FormData();
  versionForm.append('file', new Blob([tiny], { type: 'image/jpeg' }), 'tiny.jpg');
  const versionPath =
    uploadPath === 'existing tiny.jpg'
      ? `/upload/files/${fileId}/content`
      : uploadPath.replace('/content', `/${fileId}/content`);
  const version = await call(base, versionPath, { method: 'POST', body: versionForm });
  const items = await call(base, `/2.0/folders/${folderId}/items`);
  const entries = object(items.json).entries as unknown[] | undefined;
  const pass = me.ok && upload.ok && version.ok && items.ok && (entries?.length ?? 0) > 0;
  section('Box', [
    `- User path: \`GET /2.0/users/me\` — HTTP ${me.status}`,
    `- Folder lookup/create: HTTP ${folderStatus}, id \`${folderId}\``,
    `- Upload: ${uploadPath === 'existing tiny.jpg' ? 'reused existing `tiny.jpg`; working path verified as `POST /upload/files/content`' : `\`POST ${uploadPath}\``} — HTTP ${upload.status}`,
    `- New version path: \`POST ${versionPath}\` — HTTP ${version.status}`,
    `- List path: \`GET /2.0/folders/${folderId}/items\` — HTTP ${items.status}, ${entries?.length ?? 0} entries`,
    `- User response:\n\n\`\`\`json\n${sample(me.json, 1600)}\n\`\`\``,
    `- Upload response:\n\n\`\`\`json\n${sample(upload.json, 2200)}\n\`\`\``,
    `- Version response:\n\n\`\`\`json\n${sample(version.json, 1600)}\n\`\`\``,
  ]);
  finish(
    'box',
    pass,
    `user ${me.status}, upload ${upload.status}, version ${version.status}, list ${items.status}`,
  );
}

async function agentmailSpike(base: string): Promise<void> {
  const inboxes = await call(base, '/v0/inboxes');
  const inboxList = object(inboxes.json).inboxes as unknown[] | undefined;
  const inbox = inboxList?.[0];
  const inboxId =
    process.env.MAILKEEP_AGENTMAIL_INBOX_ID ||
    String(object(inbox).inbox_id || object(inbox).email);
  if (!inboxId) throw new Error('No AgentMail inbox found');
  const stamp = Date.now();
  const sent = await call(
    base,
    `/v0/inboxes/${encodeURIComponent(inboxId)}/messages/send`,
    jsonBody({
      to: ['kiter7396@gmail.com'],
      subject: `[Mailkeep spike] connector test ${stamp}`,
      text: 'AgentMail gateway spike. No action needed.',
    }),
  );
  const selfSent = await call(
    base,
    `/v0/inboxes/${encodeURIComponent(inboxId)}/messages/send`,
    jsonBody({
      to: [inboxId],
      subject: `[Mailkeep spike] attachment ${stamp}`,
      text: 'Attachment download probe.',
      attachments: [
        {
          filename: 'tiny.jpg',
          content_type: 'image/jpeg',
          content: tiny.toString('base64'),
        },
      ],
    }),
  );
  let message: Record<string, unknown> | undefined;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const after = new Date(Date.now() - 5 * 60_000).toISOString();
    const listed = await call(
      base,
      `/v0/inboxes/${encodeURIComponent(inboxId)}/messages?after=${encodeURIComponent(after)}&limit=20`,
    );
    const messages = object(listed.json).messages as unknown[] | undefined;
    message = messages
      ?.map(object)
      .find((item) => item.subject === `[Mailkeep spike] attachment ${stamp}`);
    if (message) break;
  }
  if (!message) throw new Error('Self-sent attachment message did not appear');
  const attachments = message.attachments as unknown[] | undefined;
  const attachment = object(attachments?.[0]);
  const attachmentId = String(attachment.attachment_id ?? attachment.id);
  const messageId = String(message.message_id ?? message.id);
  const metadata = await call(
    base,
    `/v0/inboxes/${encodeURIComponent(inboxId)}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
  );
  const metadataObject = object(metadata.json);
  const nestedMetadata = object(metadataObject.attachment);
  const downloadUrl = String(metadataObject.download_url ?? nestedMetadata.download_url ?? '');
  let downloaded: Response | undefined;
  let bytes = Buffer.alloc(0);
  let cdnHost = '';
  if (downloadUrl) {
    downloaded = await fetch(downloadUrl, { signal: AbortSignal.timeout(30_000) });
    bytes = Buffer.from(await downloaded.arrayBuffer());
    cdnHost = new URL(downloadUrl).host;
  }
  const pass = sent.ok && selfSent.ok && metadata.ok && Boolean(downloaded?.ok) && bytes.length > 0;
  section('AgentMail', [
    `- Inbox: \`${inboxId}\``,
    `- Paths: \`GET /v0/inboxes\`, \`POST /v0/inboxes/:inbox/messages/send\`, \`GET /v0/inboxes/:inbox/messages\`, \`GET /v0/inboxes/:inbox/messages/:id/attachments/:att\``,
    `- Test email to kiter7396@gmail.com: HTTP ${sent.status}, message \`${String(object(sent.json).message_id)}\``,
    `- Self attachment message: HTTP ${selfSent.status}, message \`${messageId}\``,
    `- Attachment metadata: HTTP ${metadata.status}`,
    `- Direct CDN download: ${downloaded ? `HTTP ${downloaded.status}, ${bytes.length} bytes, host \`${cdnHost}\`` : 'not attempted; no download_url in response'}`,
    `- Inbox response:\n\n\`\`\`json\n${sample(inboxes.json, 1800)}\n\`\`\``,
    `- Send response:\n\n\`\`\`json\n${sample(sent.json)}\n\`\`\``,
    `- Attachment metadata shape (signed URL omitted):\n\n\`\`\`json\n${sample({ ...object(metadata.json), download_url: '[signed URL omitted]' }, 1800)}\n\`\`\``,
  ]);
  finish(
    'agentmail',
    pass,
    `send ${sent.status}, attachment ${metadata.status}, download ${downloaded?.status ?? 'missing URL'}`,
  );
}

const bases = new Map<string, string>();
const gatewayList = await call(GATEWAY, 'list');
for (const connection of (object(gatewayList.json).connections as unknown[] | undefined) ?? []) {
  const item = object(connection);
  if (typeof item.provider === 'string' && typeof item.gateway_base_url === 'string') {
    bases.set(item.provider, item.gateway_base_url);
    if (
      item.provider === 'custom_api' &&
      object(item.provider_info).base_api_url === 'https://api.agentmail.to'
    ) {
      bases.set('agentmail', item.gateway_base_url);
    }
    if (
      item.provider === 'custom_api' &&
      object(item.provider_info).base_api_url === 'https://api.pinecone.io'
    ) {
      bases.set('pinecone_control', item.gateway_base_url);
    }
  }
}

const spikes: Array<[string, string, (base: string, control?: string) => Promise<void>]> = [
  ['typesafe', 'TypeSafe', typesafeSpike],
  ['ollama', 'Ollama', ollamaSpike],
  ['pinecone', 'Pinecone', pineconeSpike],
  ['box', 'Box', boxSpike],
  ['agentmail', 'AgentMail', agentmailSpike],
];

for (const [provider, label, run] of spikes) {
  const base = bases.get(provider);
  if (!base) {
    finish(provider, false, 'missing gateway base URL');
    continue;
  }
  try {
    await run(base, bases.get('pinecone_control'));
  } catch (error) {
    section(label, [`FAIL: ${String(error)}`]);
    finish(provider, false, String(error));
  }
}

function renderResult(): string {
  return `# T02 RESULT — every connector through the gateway\n\nRun: ${new Date().toISOString()} on Sprite \`mailkeep\`.\n\n${sections.join('\n')}## Quirks and notes\n\n${notes.length > 0 ? notes.map((note) => `- ${note}`).join('\n') : '- None.'}\n\n## Outcome\n\n${outcomes.map((outcome) => `- ${outcome.pass ? 'PASS' : 'FAIL'} ${outcome.name}`).join('\n')}\n`;
}

await writeFile(path.join(ROOT, 'spikes/gateway/RESULT.md'), renderResult());
if (outcomes.some((outcome) => !outcome.pass)) process.exitCode = 1;
