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
  requestResolveAnkiDuplicates,
} from '@src/lib/messaging-anki';
import type { AnkiQueueInfo } from '@src/lib/anki-queue';
import type { AnkiDuplicateConflict } from '@src/lib/anki-queue-sync';
import { translationProviderPrivacyCopy } from '@src/lib/translation-provider-privacy';
import type { AnkiDuplicateDecision } from '@src/lib/extension-messages';
import { AnkiDuplicateDialog } from '@src/components/AnkiDuplicateDialog';
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
  const [duplicateConflicts, setDuplicateConflicts] = useState<AnkiDuplicateConflict[]>([]);
  const [duplicateDecisions, setDuplicateDecisions] = useState<
    Record<string, AnkiDuplicateDecision['action'] | undefined>
  >({});
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
      if (result.duplicateConflicts.length > 0) {
        setDuplicateConflicts(result.duplicateConflicts);
        setDuplicateDecisions({});
        setAnkiQueueNotice(
          `Synced ${result.syncedCount} card${result.syncedCount === 1 ? '' : 's'}. ` +
            `${result.duplicateConflicts.length} duplicate${result.duplicateConflicts.length === 1 ? '' : 's'} need your decision.`,
        );
      } else {
        setAnkiQueueNotice(
          result.count === 0
            ? `Synced ${result.syncedCount} card${result.syncedCount === 1 ? '' : 's'} to Anki.`
            : 'Sync finished. Cards that could not be synced remain saved locally.',
        );
      }
    } catch (error) {
      setAnkiQueueNotice(error instanceof Error ? error.message : 'Could not sync the Anki queue.');
    } finally {
      setAnkiQueueBusy(false);
    }
  }

  async function handleDuplicateDecisions() {
    const decisions = duplicateConflicts.flatMap((conflict): AnkiDuplicateDecision[] => {
      const action = duplicateDecisions[conflict.queueItemId];
      return action ? [{ queueItemId: conflict.queueItemId, action }] : [];
    });
    if (decisions.length !== duplicateConflicts.length) return;

    setAnkiQueueBusy(true);
    setAnkiQueueNotice(undefined);
    try {
      const result = await requestResolveAnkiDuplicates(decisions);
      setAnkiQueueInfo(result);
      setDuplicateConflicts(result.duplicateConflicts);
      setDuplicateDecisions({});
      setAnkiQueueNotice(
        result.duplicateConflicts.length > 0
          ? `${result.duplicateConflicts.length} more duplicate${result.duplicateConflicts.length === 1 ? '' : 's'} need your decision.`
          : 'Duplicate decisions applied. The rest of the queue was synchronized.',
      );
    } catch (error) {
      setAnkiQueueNotice(
        error instanceof Error ? error.message : 'Could not apply duplicate decisions.',
      );
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
    <div className="options-page">
      <aside className="options-hero">
        <div className="options-grain" aria-hidden="true" />
        <div className="hero-header">
          <a className="brand" href="#top" aria-label="Learn Lang settings home">
            <span className="brand-mark" aria-hidden="true">L</span>
            <span>Learn Lang</span>
          </a>
          <span className="hero-badge">Extension</span>
        </div>

        <div className="hero-copy">
          <p className="eyebrow eyebrow-light">Settings / 01</p>
          <h1>Make every page part of your <em>language practice.</em></h1>
          <p className="hero-description">
            Tune the way Learn Lang translates, responds, and turns useful phrases into cards.
          </p>
          <nav className="hero-nav" aria-label="Settings sections">
            <a href="#translation"><span>01</span> Translation</a>
            <a href="#anki"><span>02</span> Anki cards</a>
          </nav>
        </div>

        <div className="hero-landscape" aria-hidden="true">
          <div className="sun" />
          <div className="mountain mountain-back" />
          <div className="mountain mountain-front" />
          <div className="hill" />
        </div>
      </aside>

      <main id="top" className="options-content">
        <header className="content-intro">
          <p className="eyebrow">Personal workspace</p>
          <h2>Settings that feel like yours.</h2>
          <p>Changes stay with your browser profile and follow you through extension sync.</p>
        </header>

        <section id="translation" className="settings-card">
          <div className="section-heading">
            <span className="section-number">01</span>
            <div>
              <h2>Translation</h2>
              <p>Choose how a selection is translated and which key brings it to life.</p>
            </div>
          </div>

          <form onSubmit={handleSave} className="settings-form">
            <div className="form-field form-field-wide">
              <label htmlFor="translation-provider">Translation provider</label>
              <select
                id="translation-provider"
                value={provider}
                onChange={e => setProvider(e.target.value as TranslationProvider)}
              >
                <option value="google">Google Translate — better quality</option>
                <option value="bergamot">Bergamot — private and offline</option>
              </select>
              <p className="field-note">
                {translationProviderPrivacyCopy(provider)}
              </p>
            </div>

            <div className="form-field">
              <label htmlFor="source-language">Source language</label>
              <div className="language-input">
                <input
                  id="source-language"
                  type="text"
                  value={pair.from_code}
                  onChange={e => setPair(p => ({ ...p, from_code: e.target.value.toLowerCase() }))}
                  placeholder="e.g. en"
                  maxLength={8}
                />
                <span>FROM</span>
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="target-language">Target language</label>
              <div className="language-input">
                <input
                  id="target-language"
                  type="text"
                  value={pair.to_code}
                  onChange={e => setPair(p => ({ ...p, to_code: e.target.value.toLowerCase() }))}
                  placeholder="e.g. ru"
                  maxLength={8}
                />
                <span>TO</span>
              </div>
            </div>

            <div className="form-field form-field-wide">
              <label htmlFor="translation-hotkey">Hold-to-translate key</label>
              <select
                id="translation-hotkey"
                value={hotkey}
                onChange={e => setHotkeyState(e.target.value)}
              >
                {MODIFIER_KEYS.map(key => (
                  <option key={key} value={key}>{key}</option>
                ))}
              </select>
              <p className="field-note">Hold this modifier while selecting or pointing at a word.</p>
            </div>

            <div className="form-action form-field-wide">
              <button type="submit" className="button button-primary">
                {saved ? 'Saved ✓' : 'Save translation settings'}
              </button>
              <span aria-live="polite">{saved ? 'Your preferences are up to date.' : 'Stored securely in extension sync.'}</span>
            </div>
          </form>

          {provider === 'bergamot' && (
            <div className="model-panel">
              <div className="model-panel-heading">
                <div>
                  <p className="mini-label">Offline translation</p>
                  <h3>Model pack</h3>
                </div>
                <span className={`status-pill status-${packStatus}`}>{packStatus}</span>
              </div>
              {pack ? (
                <>
                  <p>
                    Download the on-device model for {pack.from_code} → {pack.to_code} (
                    {formatApproxSize(pack.approxSizeBytes)}). After installation, translation works
                    offline and page selections never leave your device.
                  </p>
                  {packError && <p className="error-message">{packError}</p>}
                  <div className="inline-actions">
                    {(packStatus === 'missing' || packStatus === 'failed') && (
                      <button type="button" disabled={busy} onClick={handleInstall} className="button button-dark">
                        {packStatus === 'failed' ? 'Retry download' : 'Download model pack'}
                      </button>
                    )}
                    {packStatus === 'downloading' && (
                      <button type="button" onClick={handleCancel} className="button button-secondary">
                        Cancel download
                      </button>
                    )}
                    {packStatus === 'ready' && <p className="success-message">Ready for offline translation.</p>}
                  </div>
                </>
              ) : (
                <p>No model pack for this language pair yet. v1 supports en → ru.</p>
              )}
            </div>
          )}
        </section>

        <section id="anki" className="settings-card">
          <div className="section-heading section-heading-with-action">
            <span className="section-number">02</span>
            <div>
              <h2>Anki cards</h2>
              <p>Choose where cards are created and what each Anki field receives.</p>
            </div>
            <button
              type="button"
              onClick={() => void refreshAnki()}
              disabled={ankiStatus === 'loading'}
              className="button button-secondary refresh-button"
            >
              {ankiStatus === 'loading' ? 'Connecting…' : 'Refresh from Anki'}
            </button>
          </div>

          <div className="connection-status" aria-live="polite">
            {ankiStatus === 'ready' && (
              <p className="status-connected"><span aria-hidden="true" />Connected to Anki</p>
            )}
            {ankiStatus === 'loading' && <p>Reading decks and note types from Anki…</p>}
            {ankiStatus === 'error' && ankiError && <p className="error-message" role="alert">{ankiError}</p>}
          </div>

          <div className="queue-panel">
            <div className="queue-heading">
              <div>
                <p className="mini-label">Local safety net</p>
                <h3>Offline queue</h3>
                <p>Add cards while Anki is closed. They stay here and sync when Anki returns.</p>
              </div>
              <span className="queue-count"><strong>{ankiQueueInfo.count}</strong> waiting</span>
            </div>

            {ankiQueueInfo.lastError && ankiQueueInfo.count > 0 && (
              <p className="queue-error">Last sync attempt: {ankiQueueInfo.lastError}</p>
            )}

            <div className="queue-actions">
              <button
                type="button"
                onClick={() => void handleQueueSync()}
                disabled={ankiQueueBusy || ankiQueueInfo.count === 0}
                className="button button-dark"
              >
                {ankiQueueBusy ? 'Working…' : 'Sync now'}
              </button>
              <button
                type="button"
                onClick={() => void handleQueueExport('tsv')}
                disabled={ankiQueueBusy || ankiQueueInfo.count === 0}
                className="button button-secondary"
              >
                Export TSV
              </button>
              <button
                type="button"
                onClick={() => void handleQueueExport('csv')}
                disabled={ankiQueueBusy || ankiQueueInfo.count === 0}
                className="button button-secondary"
              >
                Export CSV
              </button>
            </div>

            <p className="queue-note">Manual TSV/CSV export is text-only and does not include generated pronunciation media.</p>

            {ankiQueueInfo.count > 0 && (
              <button
                type="button"
                onClick={() => void handleQueueClear()}
                disabled={ankiQueueBusy}
                className="danger-link"
              >
                Clear queue after manual import
              </button>
            )}

            {ankiQueueNotice && <p className="queue-notice" role="status">{ankiQueueNotice}</p>}
          </div>

          <form onSubmit={handleAnkiSave} className="settings-form anki-form">
            <div className="form-field form-field-wide">
              <label htmlFor="anki-name">Configuration name</label>
              <input
                id="anki-name"
                type="text"
                value={ankiSettings.name}
                onChange={event => setAnkiSettingsState(settings => ({ ...settings, name: event.target.value }))}
              />
            </div>

            <div className="form-field">
              <label htmlFor="anki-deck">Deck</label>
              <select
                id="anki-deck"
                value={ankiSettings.deckName}
                onChange={event => setAnkiSettingsState(settings => ({ ...settings, deckName: event.target.value }))}
                disabled={deckNames.length === 0}
              >
                {deckNames.length === 0 && (
                  <option value={ankiSettings.deckName}>{ankiSettings.deckName || 'No decks found'}</option>
                )}
                {deckNames.map(deckName => <option key={deckName} value={deckName}>{deckName}</option>)}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="anki-model">Note type</label>
              <select
                id="anki-model"
                value={ankiSettings.modelName}
                onChange={event => void handleModelChange(event.target.value)}
                disabled={modelNames.length === 0}
              >
                {modelNames.length === 0 && (
                  <option value={ankiSettings.modelName}>{ankiSettings.modelName || 'No models found'}</option>
                )}
                {modelNames.map(modelName => <option key={modelName} value={modelName}>{modelName}</option>)}
              </select>
            </div>

            <div className="field-mapping form-field-wide">
              <div className="field-mapping-header"><span>Anki field</span><span>Learn Lang value</span></div>
              {modelFieldNames.length > 0 ? (
                <div className="field-mapping-rows">
                  {modelFieldNames.map((fieldName, fieldIndex) => (
                    <div key={fieldName} className="field-mapping-row">
                      <label htmlFor={`anki-field-${fieldIndex}`}>{fieldName}</label>
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
                      >
                        <option value="">Don’t add</option>
                        {ANKI_FIELD_VALUE_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-state">Connect to Anki and choose a note type to configure its fields.</p>
              )}
            </div>

            {ankiStatus !== 'error' && ankiError && (
              <p className="error-message form-field-wide" role="alert">{ankiError}</p>
            )}

            <div className="form-action form-field-wide">
              <button type="submit" disabled={modelFieldNames.length === 0} className="button button-primary">
                {ankiSaved ? 'Anki settings saved ✓' : 'Save Anki settings'}
              </button>
              <span aria-live="polite">Field mappings apply to every new card.</span>
            </div>
          </form>
        </section>

        <footer className="page-footer">
          <span>Learn Lang Tool</span>
          <span>Private by default · Built for focused practice</span>
        </footer>
      </main>
      {duplicateConflicts.length > 0 && (
        <AnkiDuplicateDialog
          conflicts={duplicateConflicts}
          decisions={duplicateDecisions}
          busy={ankiQueueBusy}
          onDecision={(queueItemId, action) =>
            setDuplicateDecisions(current => ({ ...current, [queueItemId]: action }))
          }
          onCancel={() => {
            setDuplicateConflicts([]);
            setDuplicateDecisions({});
          }}
          onConfirm={() => void handleDuplicateDecisions()}
        />
      )}
    </div>
  );
}
