import type { AnkiNote, AnkiSettings } from './anki';
import { getAnkiQueueTag } from './anki-queue';

const ANKI_CONNECT_API_VERSION = 6;
const DEFAULT_TIMEOUT_MS = 5000;

type AnkiConnectErrorCode =
  | 'unavailable'
  | 'permission_denied'
  | 'api_key_required'
  | 'api_error'
  | 'invalid_response';

export class AnkiConnectError extends Error {
  constructor(
    public readonly code: AnkiConnectErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AnkiConnectError';
  }
}

interface AnkiConnectResponse<T> {
  result: T;
  error: string | null;
}

interface PermissionResult {
  permission: 'granted' | 'denied';
  requireApiKey?: boolean;
  version?: number;
}

function isPermissionResult(value: unknown): value is PermissionResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'permission' in value &&
    ((value as { permission: unknown }).permission === 'granted' ||
      (value as { permission: unknown }).permission === 'denied')
  );
}

interface AnkiConnectDependencies {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export interface AnkiCollectionInfo {
  deckNames: string[];
  modelNames: string[];
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

async function ensurePermission(
  settings: AnkiSettings,
  dependencies: AnkiConnectDependencies,
): Promise<void> {
  const permission = await invoke<unknown>(
    settings,
    'requestPermission',
    undefined,
    dependencies,
  );

  if (!isPermissionResult(permission)) {
    throw new AnkiConnectError(
      'invalid_response',
      'AnkiConnect returned an unexpected permission response.',
    );
  }
  if (permission.permission !== 'granted') {
    throw new AnkiConnectError(
      'permission_denied',
      'Anki denied access. Allow this extension in the AnkiConnect prompt and try again.',
    );
  }
  if (permission.requireApiKey && !settings.apiKey) {
    throw new AnkiConnectError(
      'api_key_required',
      'AnkiConnect requires an API key. Disable the API key requirement for this first version.',
    );
  }
}

function isAnkiConnectResponse(value: unknown): value is AnkiConnectResponse<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'result' in value &&
    'error' in value &&
    ((value as { error: unknown }).error === null ||
      typeof (value as { error: unknown }).error === 'string')
  );
}

function normalizeServerAddress(address: string): string {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    throw new AnkiConnectError('invalid_response', 'The AnkiConnect server address is invalid.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new AnkiConnectError(
      'invalid_response',
      'The AnkiConnect server address must use HTTP or HTTPS.',
    );
  }

  return url.toString();
}

async function invoke<T>(
  settings: AnkiSettings,
  action: string,
  params: Record<string, unknown> | undefined,
  dependencies: AnkiConnectDependencies,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  try {
    const body: Record<string, unknown> = {
      action,
      version: ANKI_CONNECT_API_VERSION,
    };
    if (params) body.params = params;
    if (settings.apiKey) body.key = settings.apiKey;

    const response = await (dependencies.fetch ?? fetch)(
      normalizeServerAddress(settings.serverAddress),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      throw new AnkiConnectError(
        'unavailable',
        `AnkiConnect returned HTTP ${response.status}.`,
      );
    }

    const payload: unknown = await response.json();
    if (!isAnkiConnectResponse(payload)) {
      throw new AnkiConnectError(
        'invalid_response',
        'AnkiConnect returned an unexpected response.',
      );
    }
    if (payload.error) {
      throw new AnkiConnectError('api_error', payload.error);
    }
    return payload.result as T;
  } catch (error) {
    if (error instanceof AnkiConnectError) throw error;
    if (controller.signal.aborted) {
      throw new AnkiConnectError(
        'unavailable',
        'AnkiConnect did not respond. Make sure Anki is open.',
      );
    }
    throw new AnkiConnectError(
      'unavailable',
      'Could not connect to AnkiConnect. Make sure Anki is open and AnkiConnect is installed.',
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function addNoteWithAnkiConnect(
  settings: AnkiSettings,
  note: AnkiNote,
  dependencies: AnkiConnectDependencies = {},
): Promise<number> {
  await ensurePermission(settings, dependencies);

  const noteId = await invoke<number | null>(
    settings,
    'addNote',
    { note },
    dependencies,
  );
  if (typeof noteId !== 'number') {
    throw new AnkiConnectError(
      'invalid_response',
      'AnkiConnect did not return the created note ID.',
    );
  }
  return noteId;
}

export async function findQueuedNoteIdsWithAnkiConnect(
  settings: AnkiSettings,
  queueItemId: string,
  dependencies: AnkiConnectDependencies = {},
): Promise<number[]> {
  await ensurePermission(settings, dependencies);
  const noteIds = await invoke<unknown>(
    settings,
    'findNotes',
    { query: `tag:${getAnkiQueueTag(queueItemId)}` },
    dependencies,
  );
  if (!Array.isArray(noteIds) || !noteIds.every(noteId => typeof noteId === 'number')) {
    throw new AnkiConnectError(
      'invalid_response',
      'AnkiConnect returned an unexpected queued-note lookup response.',
    );
  }
  return noteIds;
}

export async function removeAnkiQueueTagWithAnkiConnect(
  settings: AnkiSettings,
  noteId: number,
  queueItemId: string,
  dependencies: AnkiConnectDependencies = {},
): Promise<void> {
  await ensurePermission(settings, dependencies);
  await invoke<null>(
    settings,
    'removeTags',
    {
      notes: [noteId],
      tags: getAnkiQueueTag(queueItemId),
    },
    dependencies,
  );
}

export async function getCollectionInfoWithAnkiConnect(
  settings: AnkiSettings,
  dependencies: AnkiConnectDependencies = {},
): Promise<AnkiCollectionInfo> {
  await ensurePermission(settings, dependencies);
  const [deckNames, modelNames] = await Promise.all([
    invoke<unknown>(settings, 'deckNames', undefined, dependencies),
    invoke<unknown>(settings, 'modelNames', undefined, dependencies),
  ]);

  if (!isStringArray(deckNames) || !isStringArray(modelNames)) {
    throw new AnkiConnectError(
      'invalid_response',
      'AnkiConnect returned an unexpected deck or model list.',
    );
  }

  return { deckNames, modelNames };
}

export async function getModelFieldNamesWithAnkiConnect(
  settings: AnkiSettings,
  modelName: string,
  dependencies: AnkiConnectDependencies = {},
): Promise<string[]> {
  await ensurePermission(settings, dependencies);
  const fieldNames = await invoke<unknown>(
    settings,
    'modelFieldNames',
    { modelName },
    dependencies,
  );

  if (!isStringArray(fieldNames)) {
    throw new AnkiConnectError(
      'invalid_response',
      'AnkiConnect returned an unexpected model field list.',
    );
  }
  return fieldNames;
}

export async function browseNoteWithAnkiConnect(
  settings: AnkiSettings,
  noteId: number,
  dependencies: AnkiConnectDependencies = {},
): Promise<number[]> {
  await ensurePermission(settings, dependencies);
  const cardIds = await invoke<unknown>(
    settings,
    'guiBrowse',
    { query: `nid:${noteId}` },
    dependencies,
  );

  if (!Array.isArray(cardIds) || !cardIds.every(cardId => typeof cardId === 'number')) {
    throw new AnkiConnectError(
      'invalid_response',
      'AnkiConnect did not return the cards shown in Browse.',
    );
  }
  return cardIds;
}
