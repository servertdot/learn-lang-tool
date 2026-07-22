import type { AnkiNote } from './anki';

const ANKI_QUEUE_STORAGE_KEY = 'ankiQueue.v1';
const ANKI_QUEUE_TAG_PREFIX = 'llt_queue_';

export interface AnkiQueueItem {
  id: string;
  createdAt: number;
  note: AnkiNote;
  lastError?: string;
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

function parseQueue(value: unknown): AnkiQueueItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is AnkiQueueItem => {
    if (typeof item !== 'object' || item === null) return false;
    const candidate = item as Partial<AnkiQueueItem>;
    return (
      typeof candidate.id === 'string' &&
      typeof candidate.createdAt === 'number' &&
      isAnkiNote(candidate.note) &&
      (candidate.lastError === undefined || typeof candidate.lastError === 'string')
    );
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

  enqueue(note: AnkiNote): Promise<AnkiQueueItem> {
    return this.exclusive(async () => {
      const items = parseQueue(await this.storage.read());
      const id = this.createId();
      const item: AnkiQueueItem = {
        id,
        createdAt: this.now(),
        note: {
          ...note,
          fields: { ...note.fields },
          tags: [...note.tags, getAnkiQueueTag(id)],
          options: { ...note.options },
        },
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
        items.map(item => (item.id === id ? { ...item, lastError: error } : item)),
      );
    });
  }

  clear(): Promise<void> {
    return this.exclusive(() => this.storage.write([]));
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
