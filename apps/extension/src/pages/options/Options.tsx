import React, { useEffect, useState } from 'react';
import {
  getLanguagePair,
  setLanguagePair,
  getHotkey,
  setHotkey,
  getTranslationProvider,
  setTranslationProvider,
} from '@src/lib/storage';
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

export default function Options() {
  const [pair, setPair] = useState<LanguagePair>(DEFAULT_LANGUAGE_PAIR);
  const [hotkey, setHotkeyState] = useState(DEFAULT_HOTKEY);
  const [provider, setProvider] = useState<TranslationProvider>(DEFAULT_TRANSLATION_PROVIDER);
  const [saved, setSaved] = useState(false);
  const [packStatus, setPackStatus] = useState<ModelPackStatus>('missing');
  const [packError, setPackError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center pt-16 px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-md p-8">
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
      </div>
    </div>
  );
}
