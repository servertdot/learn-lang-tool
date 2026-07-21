export type ModelPackStatus = 'missing' | 'downloading' | 'ready' | 'failed';

export interface ModelPackInstallState {
  status: ModelPackStatus;
  errorMessage?: string;
  updatedAt: number;
}

export interface ModelPackPersistence {
  get(id: string): Promise<ModelPackInstallState | null>;
  set(id: string, state: ModelPackInstallState): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface ModelPackStore {
  getStatus(id: string): Promise<ModelPackStatus>;
  getState(id: string): Promise<ModelPackInstallState | null>;
  markDownloading(id: string): Promise<void>;
  markReady(id: string): Promise<void>;
  markFailed(id: string, errorMessage: string): Promise<void>;
  markCancelled(id: string): Promise<void>;
}

function nowState(status: ModelPackStatus, errorMessage?: string): ModelPackInstallState {
  return { status, errorMessage, updatedAt: Date.now() };
}

export function createModelPackStore(persistence: ModelPackPersistence): ModelPackStore {
  return {
    async getStatus(id) {
      const state = await persistence.get(id);
      return state?.status ?? 'missing';
    },
    async getState(id) {
      return persistence.get(id);
    },
    async markDownloading(id) {
      await persistence.set(id, nowState('downloading'));
    },
    async markReady(id) {
      await persistence.set(id, nowState('ready'));
    },
    async markFailed(id, errorMessage) {
      await persistence.set(id, nowState('failed', errorMessage));
    },
    async markCancelled(id) {
      // Partial installs must not stay ready/downloading.
      await persistence.set(id, nowState('missing'));
    },
  };
}
