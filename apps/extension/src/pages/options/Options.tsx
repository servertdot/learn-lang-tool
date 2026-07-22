import React, { useEffect, useRef, useState } from 'react';
import {
  getAnkiSettings,
  getLanguagePair,
  setAnkiSettings,
  setLanguagePair,
  getHotkey,
  setHotkey,
  getTranslationProvider,
  setTranslationProvider,
} from '@src/lib/storage';
import {
  DEFAULT_ANKI_SETTINGS,
  reconcileAnkiFieldMappings,
  type AnkiFieldValue,
  type AnkiSettings,
} from '@src/lib/anki';
import {
  requestAnkiCollectionInfo,
  requestAnkiModelFieldNames,
  requestAnkiQueueClear,
  requestAnkiQueueExport,
  requestAnkiQueueInfo,
  requestAnkiQueueSync,
} from '@src/lib/messaging-anki';
import type { AnkiQueueInfo } from '@src/lib/anki-queue';
import type { LanguagePair, TranslationProvider } from '@package/shared';
import {
  DEFAULT_LANGUAGE_PAIR,
  DEFAULT_HOTKEY,
  DEFAULT_TRANSLATION_PROVIDER,
} from '@package/shared';
import {
  formatApproxSize,
  getModelPackForLanguagePair,
} from '@src/lib/model-pack-registry';
import {
  requestModelPackCancel,
  requestModelPackInstall,
  requestModelPackStatus,
} from '@src/lib/messaging-translation-engine';
import type { ModelPackStatus } from '@src/lib/model-pack-store';
import type { LltMessage } from '@src/lib/extension-messages';
import '@pages/options/Options.css';

const MODIFIER_KEYS = ['Alt', 'Control', 'Shift', 'Meta'];

const ANKI_FIELD_VALUE_OPTIONS: { value: AnkiFieldValue; label: string }[] = [
  { value: 'textFrom', label: 'Text from' },
  { value: 'textTo', label: 'Text to' },
  { value: 'sentence', label: 'Sentence' },
  { value: 'audio', label: 'Audio' },
];

export default function Options() {
  const [pair, setPair] = useState<LanguagePair>(DEFAULT_LANGUAGE_PAIR);
  const [hotkey, setHotkeyState] = useState(DEFAULT_HOTKEY);
  const [provider, setProvider] = useState<TranslationProvider>(DEFAULT_TRANSLATION_PROVIDER);
  const [saved, setSaved] = useState(false);
  const [packStatus, setPackStatus] = useState<ModelPackStatus>('missing');
  const [packError, setPackError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [ankiSettings, setAnkiSettingsState] = useState<AnkiSettings>(DEFAULT_ANKI_SETTINGS);
  const [deckNames, setDeckNames] = useState<string[]>([]);
  const [modelNames, setModelNames] = useState<string[]>([]);
  const [modelFieldNames, setModelFieldNames] = useState<string[]>([]);
  const [ankiStatus, setAnkiStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [ankiError, setAnkiError] = useState<string | undefined>();
  const [ankiSaved, setAnkiSaved] = useState(false);
  const [ankiQueueInfo, setAnkiQueueInfo] = useState<AnkiQueueInfo>({
    count: 0,
    failedCount: 0,
  });
  const [ankiQueueBusy, setAnkiQueueBusy] = useState(false);
  const [ankiQueueNotice, setAnkiQueueNotice] = useState<string>();
  const ankiRequestVersion = useRef(0);

  const pack = getModelPackForLanguagePair(pair);

  async function refreshPackStatus(packId: string) {
    const status = await requestModelPackStatus(packId);
    setPackStatus(status);
  }

  useEffect(() => {
    Promise.all([getLanguagePair(), getHotkey(), getTranslationProvider()]).then(([p, k, value]) => {
      setPair(p);
      setHotkeyState(k);
      setProvider(value);
    });
  }, []);

  useEffect(() => {
    void refreshQueueInfo();
  }, []);

  useEffect(() => {
    let active = true;

    void (async () => {
      const stored = await getAnkiSettings();
      if (!active) return;
      setAnkiSettingsState(stored);
      await refreshAnki(stored);
    })();

    return () => {
      active = false;
      ankiRequestVersion.current += 1;
    };
  }, []);

  useEffect(() => {
    if (provider !== 'bergamot' || !pack) {
      setPackStatus('missing');
      return;
    }
    void refreshPackStatus(pack.id);
  }, [pack?.id, provider]);

  useEffect(() => {
    function onMessage(message: unknown) {
      const msg = message as LltMessage;
      if (msg.type !== 'llt.modelPack.changed') return;
      if (!pack || msg.packId !== pack.id) return;
      setPackStatus(msg.status);
      setPackError(msg.errorMessage);
      setBusy(msg.status === 'downloading');
    }
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, [pack?.id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await Promise.all([
      setLanguagePair(pair),
      setHotkey(hotkey),
      setTranslationProvider(provider),
    ]);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleInstall() {
    if (!pack) return;
    setBusy(true);
    setPackError(undefined);
    try {
      await requestModelPackInstall(pack.id);
    } catch (err) {
      setPackError(err instanceof Error ? err.message : 'Install failed');
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!pack) return;
    await requestModelPackCancel(pack.id);
    setBusy(false);
  }

  async function loadModelFields(
    modelName: string,
    currentSettings: AnkiSettings,
    requestVersion: number,
  ) {
    const fieldNames = await requestAnkiModelFieldNames(modelName);
    if (requestVersion !== ankiRequestVersion.current) return;
    setModelFieldNames(fieldNames);
    setAnkiSettingsState(settings => ({
      ...settings,
      modelName,
      fieldMappings: reconcileAnkiFieldMappings(
        fieldNames,
        currentSettings.modelName === modelName ? currentSettings.fieldMappings : {},
      ),
    }));
  }

  async function refreshAnki(currentSettings = ankiSettings) {
    const requestVersion = ankiRequestVersion.current + 1;
    ankiRequestVersion.current = requestVersion;
    setAnkiStatus('loading');
    setAnkiError(undefined);
    try {
      const info = await requestAnkiCollectionInfo();
      if (requestVersion !== ankiRequestVersion.current) return;
      setDeckNames(info.deckNames);
      setModelNames(info.modelNames);

      const deckName = info.deckNames.includes(currentSettings.deckName)
        ? currentSettings.deckName
        : (info.deckNames[0] ?? '');
      const modelName = info.modelNames.includes(currentSettings.modelName)
        ? currentSettings.modelName
        : (info.modelNames[0] ?? '');
      const nextSettings = { ...currentSettings, deckName, modelName };
      setAnkiSettingsState(nextSettings);

      if (modelName) {
        await loadModelFields(modelName, nextSettings, requestVersion);
      } else {
        setModelFieldNames([]);
      }
      if (requestVersion === ankiRequestVersion.current) {
        setAnkiStatus('ready');
        const queueResult = await requestAnkiQueueSync();
        setAnkiQueueInfo(queueResult);
      }
    } catch (error) {
      if (requestVersion !== ankiRequestVersion.current) return;
      setAnkiStatus('error');
      setAnkiError(error instanceof Error ? error.message : 'Could not connect to Anki.');
    }
  }

  async function handleModelChange(modelName: string) {
    const requestVersion = ankiRequestVersion.current + 1;
    ankiRequestVersion.current = requestVersion;
    const nextSettings = { ...ankiSettings, modelName, fieldMappings: {} };
    setAnkiSettingsState(nextSettings);
    setAnkiStatus('loading');
    setAnkiError(undefined);
    try {
      await loadModelFields(modelName, nextSettings, requestVersion);
      if (requestVersion === ankiRequestVersion.current) setAnkiStatus('ready');
    } catch (error) {
      if (requestVersion !== ankiRequestVersion.current) return;
      setAnkiStatus('error');
      setAnkiError(error instanceof Error ? error.message : 'Could not load model fields.');
    }
  }

  async function handleAnkiSave(e: React.FormEvent) {
    e.preventDefault();
    if (!ankiSettings.deckName || !ankiSettings.modelName) {
      setAnkiError('Choose an Anki deck and model before saving.');
      return;
    }
    if (!Object.values(ankiSettings.fieldMappings).some(Boolean)) {
      setAnkiError('Map at least one Anki field.');
      return;
    }

    await setAnkiSettings(ankiSettings);
    setAnkiError(undefined);
    setAnkiSaved(true);
    setTimeout(() => setAnkiSaved(false), 2000);
  }

  async function refreshQueueInfo() {
    try {
      setAnkiQueueInfo(await requestAnkiQueueInfo());
    } catch (error) {
      setAnkiQueueNotice(
        error instanceof Error ? error.message : 'Could not read the local Anki queue.',
      );
    }
  }

  async function handleQueueSync() {
    setAnkiQueueBusy(true);
    setAnkiQueueNotice(undefined);
    try {
      const result = await requestAnkiQueueSync();
      setAnkiQueueInfo(result);
      setAnkiQueueNotice(
        result.count === 0
          ? `Synced ${result.syncedCount} card${result.syncedCount === 1 ? '' : 's'} to Anki.`
          : 'Anki is still unavailable. Your cards remain saved locally.',
      );
    } catch (error) {
      setAnkiQueueNotice(error instanceof Error ? error.message : 'Could not sync the Anki queue.');
    } finally {
      setAnkiQueueBusy(false);
    }
  }

  async function handleQueueExport(format: 'tsv' | 'csv') {
    setAnkiQueueBusy(true);
    setAnkiQueueNotice(undefined);
    try {
      const exported = await requestAnkiQueueExport(format);
      const url = URL.createObjectURL(new Blob([exported.content], { type: exported.mimeType }));
      const link = document.createElement('a');
      link.href = url;
      link.download = exported.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setAnkiQueueNotice(
        `${format.toUpperCase()} downloaded. The cards remain queued until you clear or sync them.`,
      );
    } catch (error) {
      setAnkiQueueNotice(error instanceof Error ? error.message : 'Could not export the queue.');
    } finally {
      setAnkiQueueBusy(false);
    }
  }

  async function handleQueueClear() {
    const confirmed = window.confirm(
      `Remove ${ankiQueueInfo.count} waiting card${ankiQueueInfo.count === 1 ? '' : 's'} from this browser? Only do this after importing an export into Anki.`,
    );
    if (!confirmed) return;

    setAnkiQueueBusy(true);
    setAnkiQueueNotice(undefined);
    try {
      await requestAnkiQueueClear();
      setAnkiQueueInfo({ count: 0, failedCount: 0 });
      setAnkiQueueNotice('Local Anki queue cleared.');
    } catch (error) {
      setAnkiQueueNotice(error instanceof Error ? error.message : 'Could not clear the queue.');
    } finally {
      setAnkiQueueBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center py-16 px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-2xl p-8">
        <h1 className="text-xl font-semibold text-gray-900 mb-6">Translation Settings</h1>

        <form onSubmit={handleSave} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Translation provider
            </label>
            <select
              value={provider}
              onChange={e => setProvider(e.target.value as TranslationProvider)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="google">Google Translate — better quality</option>
              <option value="bergamot">Bergamot — private and offline</option>
            </select>
            <p className="mt-2 text-xs text-gray-500 leading-relaxed">
              {provider === 'google'
                ? 'Selected text is sent directly to translate.google.com. This is an unofficial endpoint and may be rate-limited or changed by Google.'
                : 'Selected text stays on this device. An offline model pack is required and translation quality may be lower.'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Source language code
            </label>
            <input
              type="text"
              value={pair.from_code}
              onChange={e => setPair(p => ({ ...p, from_code: e.target.value.toLowerCase() }))}
              placeholder="e.g. en"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Target language code
            </label>
            <input
              type="text"
              value={pair.to_code}
              onChange={e => setPair(p => ({ ...p, to_code: e.target.value.toLowerCase() }))}
              placeholder="e.g. ru"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Hotkey (modifier key to hold)
            </label>
            <select
              value={hotkey}
              onChange={e => setHotkeyState(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {MODIFIER_KEYS.map(k => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            {saved ? '✓ Saved' : 'Save settings'}
          </button>
        </form>

        {provider === 'bergamot' && (
          <div className="mt-8 border-t border-gray-100 pt-6">
            <h2 className="text-sm font-semibold text-gray-900">Model pack</h2>
            {pack ? (
              <>
                <p className="mt-2 text-xs text-gray-500 leading-relaxed">
                  Download the on-device translation model for {pack.from_code}→{pack.to_code} (
                  {formatApproxSize(pack.approxSizeBytes)}). After install, translation works offline.
                  Your page selections are never uploaded.
                </p>
                <p className="mt-2 text-xs font-medium text-gray-700">
                  Status: <span className="uppercase tracking-wide">{packStatus}</span>
                </p>
                {packError && <p className="mt-1 text-xs text-rose-600">{packError}</p>}
                <div className="mt-3 flex gap-2">
                  {(packStatus === 'missing' || packStatus === 'failed') && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleInstall}
                      className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-600 disabled:opacity-50"
                    >
                      {packStatus === 'failed' ? 'Retry download' : 'Download model pack'}
                    </button>
                  )}
                  {packStatus === 'downloading' && (
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700"
                    >
                      Cancel download
                    </button>
                  )}
                  {packStatus === 'ready' && (
                    <p className="text-xs text-emerald-700">Ready for offline translation.</p>
                  )}
                </div>
              </>
            ) : (
              <p className="mt-2 text-xs text-gray-500">
                No model pack for this language pair yet. v1 supports en→ru.
              </p>
            )}
          </div>
        )}

        <section className="mt-8 border-t border-gray-200 pt-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Anki cards</h2>
              <p className="mt-1 text-sm leading-relaxed text-gray-500">
                Choose where cards are created and what each Anki field receives.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refreshAnki()}
              disabled={ankiStatus === 'loading'}
              className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-wait disabled:opacity-50"
            >
              {ankiStatus === 'loading' ? 'Connecting…' : 'Refresh from Anki'}
            </button>
          </div>

          <div className="mt-4 min-h-5" aria-live="polite">
            {ankiStatus === 'ready' && (
              <p className="flex items-center gap-2 text-xs font-medium text-emerald-700">
                <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
                Connected to Anki
              </p>
            )}
            {ankiStatus === 'loading' && (
              <p className="text-xs text-gray-500">Reading decks and note types from Anki…</p>
            )}
            {ankiStatus === 'error' && ankiError && (
              <p className="text-xs leading-relaxed text-rose-600" role="alert">
                {ankiError}
              </p>
            )}
          </div>

          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Offline queue</h3>
                <p className="mt-1 text-xs leading-relaxed text-gray-600">
                  Add cards while Anki is closed. They stay in this browser and sync automatically
                  when Anki becomes available.
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                {ankiQueueInfo.count} waiting
              </span>
            </div>

            {ankiQueueInfo.lastError && ankiQueueInfo.count > 0 && (
              <p className="mt-3 text-xs leading-relaxed text-amber-800">
                Last sync attempt: {ankiQueueInfo.lastError}
              </p>
            )}

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => void handleQueueSync()}
                disabled={ankiQueueBusy || ankiQueueInfo.count === 0}
                className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {ankiQueueBusy ? 'Working…' : 'Sync now'}
              </button>
              <button
                type="button"
                onClick={() => void handleQueueExport('tsv')}
                disabled={ankiQueueBusy || ankiQueueInfo.count === 0}
                className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Export TSV
              </button>
              <button
                type="button"
                onClick={() => void handleQueueExport('csv')}
                disabled={ankiQueueBusy || ankiQueueInfo.count === 0}
                className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Export CSV
              </button>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-amber-900/80">
              Manual TSV/CSV export is text-only and does not include generated pronunciation
              media.
            </p>

            {ankiQueueInfo.count > 0 && (
              <button
                type="button"
                onClick={() => void handleQueueClear()}
                disabled={ankiQueueBusy}
                className="mt-3 text-xs font-medium text-rose-700 underline decoration-rose-300 underline-offset-2 disabled:opacity-40"
              >
                Clear queue after manual import
              </button>
            )}

            {ankiQueueNotice && (
              <p className="mt-3 text-xs leading-relaxed text-gray-700" role="status">
                {ankiQueueNotice}
              </p>
            )}
          </div>

          <form onSubmit={handleAnkiSave} className="mt-5 space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="anki-name">
                Name
              </label>
              <input
                id="anki-name"
                type="text"
                value={ankiSettings.name}
                onChange={event =>
                  setAnkiSettingsState(settings => ({ ...settings, name: event.target.value }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="anki-deck">
                  Deck
                </label>
                <select
                  id="anki-deck"
                  value={ankiSettings.deckName}
                  onChange={event =>
                    setAnkiSettingsState(settings => ({
                      ...settings,
                      deckName: event.target.value,
                    }))
                  }
                  disabled={deckNames.length === 0}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                >
                  {deckNames.length === 0 && (
                    <option value={ankiSettings.deckName}>{ankiSettings.deckName || 'No decks found'}</option>
                  )}
                  {deckNames.map(deckName => (
                    <option key={deckName} value={deckName}>
                      {deckName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="anki-model">
                  Model
                </label>
                <select
                  id="anki-model"
                  value={ankiSettings.modelName}
                  onChange={event => void handleModelChange(event.target.value)}
                  disabled={modelNames.length === 0}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                >
                  {modelNames.length === 0 && (
                    <option value={ankiSettings.modelName}>
                      {ankiSettings.modelName || 'No models found'}
                    </option>
                  )}
                  {modelNames.map(modelName => (
                    <option key={modelName} value={modelName}>
                      {modelName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4 border-b border-gray-200 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <span>Field</span>
                <span>Value</span>
              </div>
              {modelFieldNames.length > 0 ? (
                <div className="divide-y divide-gray-100">
                  {modelFieldNames.map((fieldName, fieldIndex) => (
                    <div
                      key={fieldName}
                      className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-center gap-4 py-3"
                    >
                      <label className="truncate text-sm font-medium text-gray-700" htmlFor={`anki-field-${fieldIndex}`}>
                        {fieldName}
                      </label>
                      <select
                        id={`anki-field-${fieldIndex}`}
                        value={ankiSettings.fieldMappings[fieldName] ?? ''}
                        onChange={event =>
                          setAnkiSettingsState(settings => ({
                            ...settings,
                            fieldMappings: {
                              ...settings.fieldMappings,
                              [fieldName]: (event.target.value || null) as AnkiFieldValue | null,
                            },
                          }))
                        }
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Don’t add</option>
                        {ANKI_FIELD_VALUE_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-5 text-sm text-gray-500">
                  Connect to Anki and choose a model to configure its fields.
                </p>
              )}
            </div>

            {ankiStatus !== 'error' && ankiError && (
              <p className="text-xs leading-relaxed text-rose-600" role="alert">
                {ankiError}
              </p>
            )}

            <button
              type="submit"
              disabled={modelFieldNames.length === 0}
              className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 transition-colors disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {ankiSaved ? '✓ Anki settings saved' : 'Save Anki settings'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
