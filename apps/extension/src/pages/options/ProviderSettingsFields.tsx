import type { TranslationProvider } from '@package/shared';
import type { TranslationProviderSettings } from '@src/lib/translation-provider-settings';

interface Props {
  provider: TranslationProvider;
  settings: TranslationProviderSettings;
  onChange: (patch: Partial<TranslationProviderSettings>) => void;
}

function gmailAlias(email: string): string | undefined {
  const mailbox = /^([a-z0-9]+(?:\.[a-z0-9]+)*)(?:\+[^@\s]+)?@gmail\.com$/i.exec(email.trim());
  if (mailbox) return `${mailbox[1].toLowerCase()}+learnlangtool@gmail.com`;
}

export function ProviderSettingsFields({ provider, settings, onChange }: Props) {
  if (provider === 'mymemory') {
    const alias = gmailAlias(settings.myMemoryEmail);
    return (
      <div className="form-field form-field-wide">
        <label htmlFor="mymemory-email">Contact email (optional)</label>
        <input id="mymemory-email" type="email" autoComplete="email"
          value={settings.myMemoryEmail} aria-describedby="mymemory-email-note"
          onChange={event => onChange({ myMemoryEmail: event.target.value })} />
        <p id="mymemory-email-note" className="field-note">
          MyMemory allows 5,000 characters per day anonymously, or 50,000 with an address
          where they can reach you. The extension stores it on this device and sends it with
          each MyMemory request.
        </p>
        {alias && alias !== settings.myMemoryEmail && (
          <button type="button" className="button button-secondary provider-alias"
            onClick={() => onChange({ myMemoryEmail: alias })}>
            Use +learnlangtool Gmail alias
          </button>
        )}
        {alias && <p className="field-note">Mail to this alias arrives in the same Gmail inbox.</p>}
      </div>
    );
  }

  if (provider === 'microsoft') {
    return (
      <>
        <div className="form-field">
          <label htmlFor="microsoft-key">Azure Translator key</label>
          <input id="microsoft-key" type="password" autoComplete="off" required pattern={'.*\\S.*'}
            value={settings.microsoftKey} aria-describedby="microsoft-key-note"
            onChange={event => onChange({ microsoftKey: event.target.value })} />
          <p id="microsoft-key-note" className="field-note">Find the key under Keys and Endpoint in Azure. The extension stores it on this device.</p>
        </div>
        <div className="form-field">
          <label htmlFor="microsoft-region">Azure region</label>
          <input id="microsoft-region" type="text" placeholder="e.g. westeurope" autoComplete="off"
            value={settings.microsoftRegion} aria-describedby="microsoft-region-note" spellCheck={false}
            onChange={event => onChange({ microsoftRegion: event.target.value })} />
          <p id="microsoft-region-note" className="field-note">Use the region of your Azure resource. Leave blank for a global Translator resource.</p>
        </div>
      </>
    );
  }

  if (provider === 'deepl') {
    return (
      <div className="form-field-wide field-note">
        Run the DeepL proxy on this device at <code>http://localhost:3000</code> and configure
        your API key in the proxy.{' '}
        <a href="https://github.com/DeepL/deepl-api-nodejs-proxy" target="_blank" rel="noreferrer">DeepL proxy setup</a>
      </div>
    );
  }
  return null;
}
