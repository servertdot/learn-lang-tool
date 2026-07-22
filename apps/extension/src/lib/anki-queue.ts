import type { AnkiNote } from './anki';
import type { PronunciationRequest } from './audio-tts-provider';

const ANKI_QUEUE_STORAGE_KEY = 'ankiQueue.v1';
const ANKI_QUEUE_TAG_PREFIX = 'llt_queue_';

/**
 * Audio sync status for a queued card.
 * Legacy items created before audio support have no audio requirement.
 */
export type AnkiQueueAudioStatus =
  | 'legacy_text_only'
  | 'waiting_for_audio'
  | 'ready_to_sync'
  | 'sync_failed'
  | 'audio_failed';

export interface AnkiQueueItem {
  id: string;
  createdAt: number;
  note: AnkiNote;
  lastError?: string;
  /** Present on all newly created items; absent/legacy for pre-audio queue entries. */
  audioStatus?: AnkiQueueAudioStatus;
  pronunciationRequest?: PronunciationRequest;
  artifactKey?: string;
}

export interface AnkiQueueEnqueueOptions {
  pronunciationRequest?: PronunciationRequest;
  artifactKey?: string;
  audioStatus?: AnkiQueueAudioStatus;
}

export interface AnkiQueueInfo {
  count: number;
  failedCount: number;
  lastError?: string;
}

export interface AnkiQueueStorage {
  read(): Promise<unknown>;
  write(items: AnkiQueueItem[]): Promise<void>;
}

export interface AnkiQueueDependencies {
  createId?: () => string;
  now?: () => number;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).every(entry => typeof entry === 'string')
  );
}

function isAnkiNote(value: unknown): value is AnkiNote {
  if (typeof value !== 'object' || value === null) return false;
  const note = value as Partial<AnkiNote>;
  return (
    typeof note.deckName === 'string' &&
    typeof note.modelName === 'string' &&
    isStringRecord(note.fields) &&
    Array.isArray(note.tags) &&
    note.tags.every(tag => typeof tag === 'string') &&
    typeof note.options === 'object' &&
    note.options !== null &&
    typeof note.options.allowDuplicate === 'boolean'
  );
}

function isPronunciationRequest(value: unknown): value is PronunciationRequest {
  if (typeof value !== 'object' || value === null) return false;
  const request = value as Partial<PronunciationRequest>;
  return (
    typeof request.text === 'string' &&
    typeof request.language === 'string' &&
    typeof request.providerId === 'string' &&
    typeof request.providerRevision === 'string' &&
    typeof request.voiceId === 'string' &&
    typeof request.speed === 'number' &&
    typeof request.encodingVersion === 'number'
  );
}

const AUDIO_STATUSES: ReadonlySet<string> = new Set([
  'legacy_text_only',
  'waiting_for_audio',
  'ready_to_sync',
  'sync_failed',
  'audio_failed',
]);

function parseQueue(value: unknown): AnkiQueueItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): AnkiQueueItem[] => {
    if (typeof item !== 'object' || item === null) return [];
    const candidate = item as Partial<AnkiQueueItem>;
    if (
      typeof candidate.id !== 'string' ||
      typeof candidate.createdAt !== 'number' ||
      !isAnkiNote(candidate.note) ||
      (candidate.lastError !== undefined && typeof candidate.lastError !== 'string')
    ) {
      return [];
    }

    // Pre-audio queue entries remain syncable as text-only.
    if (candidate.audioStatus === undefined && candidate.pronunciationRequest === undefined) {
      return [
        {
          id: candidate.id,
          createdAt: candidate.createdAt,
          note: candidate.note,
          lastError: candidate.lastError,
          audioStatus: 'legacy_text_only',
        },
      ];
    }

    if (
      candidate.audioStatus === undefined ||
      !AUDIO_STATUSES.has(candidate.audioStatus) ||
      (candidate.artifactKey !== undefined && typeof candidate.artifactKey !== 'string') ||
      (candidate.pronunciationRequest !== undefined &&
        !isPronunciationRequest(candidate.pronunciationRequest))
    ) {
      return [];
    }

    return [
      {
        id: candidate.id,
        createdAt: candidate.createdAt,
        note: candidate.note,
        lastError: candidate.lastError,
        audioStatus: candidate.audioStatus,
        pronunciationRequest: candidate.pronunciationRequest,
        artifactKey: candidate.artifactKey,
      },
    ];
  });
}

function cloneItem(item: AnkiQueueItem): AnkiQueueItem {
  return {
    ...item,
    note: {
      ...item.note,
      fields: { ...item.note.fields },
      tags: [...item.note.tags],
      options: { ...item.note.options },
    },
    pronunciationRequest: item.pronunciationRequest
      ? { ...item.pronunciationRequest }
      : undefined,
  };
}

export function getAnkiQueueTag(id: string): string {
  return `${ANKI_QUEUE_TAG_PREFIX}${id.replace(/[^a-zA-Z0-9]/g, '')}`;
}

export function isAnkiQueueTag(tag: string): boolean {
  return tag.startsWith(ANKI_QUEUE_TAG_PREFIX);
}

export function createChromeAnkiQueueStorage(): AnkiQueueStorage {
  return {
    async read() {
      const stored = await chrome.storage.local.get(ANKI_QUEUE_STORAGE_KEY);
      return stored[ANKI_QUEUE_STORAGE_KEY];
    },
    async write(items) {
      await chrome.storage.local.set({ [ANKI_QUEUE_STORAGE_KEY]: items });
    },
  };
}

export class AnkiQueue {
  private operation: Promise<void> = Promise.resolve();
  private readonly createId: () => string;
  private readonly now: () => number;

  constructor(
    private readonly storage: AnkiQueueStorage,
    dependencies: AnkiQueueDependencies = {},
  ) {
    this.createId = dependencies.createId ?? (() => crypto.randomUUID());
    this.now = dependencies.now ?? (() => Date.now());
  }

  list(): Promise<AnkiQueueItem[]> {
    return this.exclusive(async () => parseQueue(await this.storage.read()).map(cloneItem));
  }

  enqueue(note: AnkiNote, options: AnkiQueueEnqueueOptions = {}): Promise<AnkiQueueItem> {
    return this.exclusive(async () => {
      const items = parseQueue(await this.storage.read());
      const id = this.createId();
      const requiresAudio = options.pronunciationRequest !== undefined;
      const item: AnkiQueueItem = {
        id,
        createdAt: this.now(),
        note: {
          ...note,
          fields: { ...note.fields },
          tags: [...note.tags, getAnkiQueueTag(id)],
          options: { ...note.options },
        },
        audioStatus:
          options.audioStatus ??
          (requiresAudio
            ? options.artifactKey
              ? 'ready_to_sync'
              : 'waiting_for_audio'
            : 'legacy_text_only'),
        pronunciationRequest: options.pronunciationRequest,
        artifactKey: options.artifactKey,
      };
      await this.storage.write([...items, item]);
      return cloneItem(item);
    });
  }

  remove(id: string): Promise<void> {
    return this.exclusive(async () => {
      const items = parseQueue(await this.storage.read());
      await this.storage.write(items.filter(item => item.id !== id));
    });
  }

  setError(id: string, error: string): Promise<void> {
    return this.exclusive(async () => {
      const items = parseQueue(await this.storage.read());
      await this.storage.write(
        items.map(item =>
          item.id === id
            ? {
                ...item,
                lastError: error,
                audioStatus:
                  item.audioStatus === 'waiting_for_audio' || item.audioStatus === 'ready_to_sync'
                    ? 'sync_failed'
                    : item.audioStatus,
              }
            : item,
        ),
      );
    });
  }

  setAudioFailed(id: string, error: string): Promise<void> {
    return this.exclusive(async () => {
      const items = parseQueue(await this.storage.read());
      await this.storage.write(
        items.map(item =>
          item.id === id
            ? { ...item, lastError: error, audioStatus: 'audio_failed' as const }
            : item,
        ),
      );
    });
  }

  setAudioReady(id: string, artifactKey: string): Promise<void> {
    return this.exclusive(async () => {
      const items = parseQueue(await this.storage.read());
      await this.storage.write(
        items.map(item =>
          item.id === id
            ? {
                ...item,
                artifactKey,
                audioStatus: 'ready_to_sync' as const,
                lastError: undefined,
              }
            : item,
        ),
      );
    });
  }

  clear(): Promise<AnkiQueueItem[]> {
    return this.exclusive(async () => {
      const items = parseQueue(await this.storage.read());
      await this.storage.write([]);
      return items.map(cloneItem);
    });
  }

  async getInfo(): Promise<AnkiQueueInfo> {
    const items = await this.list();
    const failed = items.filter(item => item.lastError);
    return {
      count: items.length,
      failedCount: failed.length,
      lastError: failed.at(-1)?.lastError,
    };
  }

  private exclusive<T>(callback: () => Promise<T>): Promise<T> {
    const result = this.operation.then(callback, callback);
    this.operation = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
