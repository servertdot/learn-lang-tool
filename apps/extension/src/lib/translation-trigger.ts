import type { PageTextSource, PageTextSourceKind } from './page-text-source';

export interface RelayedTextSource {
  text: string;
  kind: PageTextSourceKind;
}

interface TranslationTriggerOptions {
  isTopFrame: boolean;
  readSource(): Promise<PageTextSource | null>;
  showSource(source: PageTextSource): void | Promise<void>;
  relaySource(source: RelayedTextSource): void | Promise<void>;
}

export async function handleTranslationTrigger(
  options: TranslationTriggerOptions,
): Promise<void> {
  const source = await options.readSource();
  if (!source) return;

  if (options.isTopFrame) {
    await options.showSource(source);
    return;
  }

  await options.relaySource({ text: source.text, kind: source.kind });
}
