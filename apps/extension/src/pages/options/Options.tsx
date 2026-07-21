import React, { useEffect, useState } from 'react';
import { getLanguagePair, setLanguagePair, getHotkey, setHotkey } from '@src/lib/storage';
import type { LanguagePair } from '@package/shared';
import { DEFAULT_LANGUAGE_PAIR, DEFAULT_HOTKEY } from '@package/shared';
import '@pages/options/Options.css';

const MODIFIER_KEYS = ['Alt', 'Control', 'Shift', 'Meta'];

export default function Options() {
  const [pair, setPair] = useState<LanguagePair>(DEFAULT_LANGUAGE_PAIR);
  const [hotkey, setHotkeyState] = useState(DEFAULT_HOTKEY);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([getLanguagePair(), getHotkey()]).then(([p, k]) => {
      setPair(p);
      setHotkeyState(k);
    });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await Promise.all([setLanguagePair(pair), setHotkey(hotkey)]);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center pt-16 px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-md p-8">
        <h1 className="text-xl font-semibold text-gray-900 mb-6">Translation Settings</h1>

        <form onSubmit={handleSave} className="space-y-5">
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
                <option key={k} value={k}>{k}</option>
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
      </div>
    </div>
  );
}
