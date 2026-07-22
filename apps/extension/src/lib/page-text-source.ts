import { getWordRangeAtRange } from './word-at-caret';

export type PageTextSourceKind =
  | 'selection'
  | 'editable-selection'
  | 'hovered-word'
  | 'youtube-caption'
  | 'clipboard-selection';

export interface PageTextSource {
  text: string;
  kind: PageTextSourceKind;
  range: Range | null;
  rect: DOMRect | null;
}

interface ClipboardPort {
  readText(): Promise<string>;
  writeText(text: string): Promise<void>;
}

interface ReadPageTextSourceOptions {
  window: Window;
  document: Document;
  pageUrl?: URL;
  pointer?: { x: number; y: number };
  clipboard?: ClipboardPort;
  copySelection?: () => boolean;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function rectForElement(element: Element | null): DOMRect | null {
  return element?.getBoundingClientRect() ?? null;
}

function caretRangeAtPoint(document: Document, x: number, y: number): Range | null {
  const position = document.caretPositionFromPoint?.(x, y);
  if (position) {
    const range = document.createRange();
    try {
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
      return range;
    } catch {
      return null;
    }
  }

  const legacyDocument = document as unknown as {
    caretRangeFromPoint?: (pointX: number, pointY: number) => Range | null;
  };
  return legacyDocument.caretRangeFromPoint?.(x, y) ?? null;
}

function rectContainsPoint(rect: DOMRect, x: number, y: number): boolean {
  const tolerance = 1;
  return (
    x >= rect.left - tolerance &&
    x <= rect.right + tolerance &&
    y >= rect.top - tolerance &&
    y <= rect.bottom + tolerance
  );
}

export function readHoveredWord(
  document: Document,
  pointer: { x: number; y: number },
): PageTextSource | null {
  const hitElement = document.elementFromPoint(pointer.x, pointer.y);
  if (hitElement?.closest('#__llt-root')) return null;

  const caretRange = caretRangeAtPoint(document, pointer.x, pointer.y);
  if (!caretRange) return null;

  const caretNode = caretRange.startContainer;
  const caretElement =
    caretNode.nodeType === Node.ELEMENT_NODE
      ? (caretNode as Element)
      : caretNode.parentElement;
  if (
    hitElement &&
    caretElement &&
    !hitElement.contains(caretElement) &&
    !caretElement.contains(hitElement)
  ) {
    return null;
  }

  const { word, range } = getWordRangeAtRange(caretRange);
  if (!word || !range) return null;

  const clientRects = Array.from(range.getClientRects());
  if (
    clientRects.length > 0 &&
    !clientRects.some(rect => rectContainsPoint(rect, pointer.x, pointer.y))
  ) {
    return null;
  }

  return {
    text: word,
    kind: 'hovered-word',
    range,
    rect: clientRects[0] ?? null,
  };
}

function readEditableSelection(document: Document): PageTextSource | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)) {
    return null;
  }

  const start = active.selectionStart;
  const end = active.selectionEnd;
  if (start === null || end === null || start === end) return null;

  const text = normalizeText(active.value.slice(start, end));
  if (!text) return null;

  return {
    text,
    kind: 'editable-selection',
    range: null,
    rect: active.getBoundingClientRect(),
  };
}

function readYouTubeCaption(document: Document, pageUrl: URL): PageTextSource | null {
  const isYouTube =
    pageUrl.hostname === 'youtube.com' || pageUrl.hostname.endsWith('.youtube.com');
  if (!isYouTube) return null;

  const segments = Array.from(
    document.querySelectorAll<HTMLElement>(
      '.ytp-caption-window-container .ytp-caption-segment',
    ),
  );
  const text = normalizeText(segments.map(segment => segment.textContent ?? '').join(''));
  if (!text) return null;

  const captionBox = segments.at(-1)?.closest('.caption-window') ?? segments.at(-1) ?? null;
  return {
    text,
    kind: 'youtube-caption',
    range: null,
    rect: rectForElement(captionBox),
  };
}

async function readGoogleDocsClipboardSelection(
  pageUrl: URL,
  clipboard: ClipboardPort | undefined,
  copySelection: (() => boolean) | undefined,
): Promise<PageTextSource | null> {
  const isGoogleDoc =
    pageUrl.hostname === 'docs.google.com' && pageUrl.pathname.startsWith('/document/');
  if (!isGoogleDoc || !clipboard || !copySelection) return null;

  let previousText: string;
  try {
    previousText = await clipboard.readText();
  } catch {
    return null;
  }

  const emptyMarker = `__llt_empty_${Date.now()}_${Math.random()}`;
  try {
    await clipboard.writeText(emptyMarker);
    if (!copySelection()) return null;

    const copiedText = normalizeText(await clipboard.readText());
    if (!copiedText || copiedText === emptyMarker) return null;
    return {
      text: copiedText,
      kind: 'clipboard-selection',
      range: null,
      rect: null,
    };
  } catch {
    return null;
  } finally {
    try {
      await clipboard.writeText(previousText);
    } catch {
      // Translation should still work if restoring the old clipboard is blocked.
    }
  }
}

export async function readPageTextSource(
  options: ReadPageTextSourceOptions,
): Promise<PageTextSource | null> {
  const selection = options.window.getSelection();
  const selectionText = normalizeText(selection?.toString() ?? '');
  const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  if (selectionText) {
    return {
      text: selectionText,
      kind: 'selection',
      range,
      rect: range?.getBoundingClientRect() ?? null,
    };
  }

  const editableSelection = readEditableSelection(options.document);
  if (editableSelection) return editableSelection;

  if (options.pointer) {
    const hoveredWord = readHoveredWord(options.document, options.pointer);
    if (hoveredWord) return hoveredWord;
  }

  const pageUrl = options.pageUrl ?? new URL(options.window.location.href);
  const youtubeCaption = readYouTubeCaption(options.document, pageUrl);
  if (youtubeCaption) return youtubeCaption;

  return readGoogleDocsClipboardSelection(
    pageUrl,
    options.clipboard,
    options.copySelection,
  );
}
