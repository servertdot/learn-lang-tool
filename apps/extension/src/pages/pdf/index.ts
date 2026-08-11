import {
  GlobalWorkerOptions,
  TextLayer,
  getDocument,
  type PDFDocumentProxy,
} from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { LltMessage } from '@src/lib/extension-messages';
import { readCurrentSelection } from '@src/lib/page-text-source';
import { getHotkey } from '@src/lib/storage';
import { registerSelectionHotkey } from '@src/lib/selection-hotkey';
import './index.css';

interface MimeStreamInfo {
  originalUrl: string;
  streamUrl: string;
  tabId: number;
}

interface MimeHandlerApi {
  getStreamInfo(): Promise<MimeStreamInfo>;
  abortAndFallbackToNativeHandler(): Promise<void>;
}

const mimeHandler = (
  chrome as typeof chrome & { mimeHandler?: MimeHandlerApi }
).mimeHandler;

const viewer = document.querySelector<HTMLDivElement>('#viewer')!;
const status = document.querySelector<HTMLDivElement>('#status')!;
const title = document.querySelector<HTMLDivElement>('#document-title')!;
const zoomLevel = document.querySelector<HTMLOutputElement>('#zoom-level')!;
const zoomOut = document.querySelector<HTMLButtonElement>('#zoom-out')!;
const zoomIn = document.querySelector<HTMLButtonElement>('#zoom-in')!;
const download = document.querySelector<HTMLButtonElement>('#download')!;
const nativeViewer = document.querySelector<HTMLButtonElement>('#native-viewer')!;

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

let documentBytes: Uint8Array | null = null;
let pdfDocument: PDFDocumentProxy | null = null;
let originalUrl = '';
let originalFilename = 'document.pdf';
let handlerTabId: number | null = null;
let scale = 1.25;
let renderGeneration = 0;

function filenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const filename = decodeURIComponent(pathname.split('/').at(-1) ?? '');
    return filename.toLowerCase().endsWith('.pdf') ? filename : 'document.pdf';
  } catch {
    return 'document.pdf';
  }
}

function showStatus(message: string): void {
  status.textContent = message;
  status.hidden = false;
}

async function renderPdf(): Promise<void> {
  if (!pdfDocument) return;

  const generation = ++renderGeneration;
  viewer.replaceChildren();
  viewer.style.setProperty('--scale-factor', String(scale));
  zoomLevel.value = `${Math.round((scale / 1.25) * 100)}%`;
  showStatus('Rendering PDF…');

  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    if (generation !== renderGeneration) return;

    const page = await pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const pageElement = document.createElement('section');
    pageElement.className = 'page';
    pageElement.dataset.pageNumber = String(pageNumber);
    pageElement.setAttribute('aria-label', `Page ${pageNumber}`);
    pageElement.style.width = `${Math.floor(viewport.width)}px`;
    pageElement.style.height = `${Math.floor(viewport.height)}px`;

    const canvas = document.createElement('canvas');
    const outputScale = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    pageElement.append(canvas);

    const textLayerElement = document.createElement('div');
    textLayerElement.className = 'textLayer';
    pageElement.append(textLayerElement);
    viewer.append(pageElement);

    const canvasContext = canvas.getContext('2d');
    if (!canvasContext) throw new Error('Canvas rendering is unavailable.');

    await Promise.all([
      page.render({
        canvas,
        canvasContext,
        viewport,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
      }).promise,
      new TextLayer({
        textContentSource: page.streamTextContent(),
        container: textLayerElement,
        viewport,
      }).render(),
    ]);
  }

  if (generation === renderGeneration) status.hidden = true;
}

async function loadPdf(): Promise<void> {
  if (!mimeHandler) {
    showStatus('This Chrome version cannot open PDFs in Learn Lang Tool.');
    return;
  }

  const streamInfo = await mimeHandler.getStreamInfo();
  handlerTabId = streamInfo.tabId;
  originalUrl = streamInfo.originalUrl;
  originalFilename = filenameFromUrl(originalUrl);
  title.textContent = originalFilename;
  document.title = `${originalFilename} — Learn Lang Tool`;

  const response = await fetch(streamInfo.streamUrl);
  if (!response.ok) throw new Error(`Could not read PDF (${response.status}).`);
  documentBytes = new Uint8Array(await response.arrayBuffer());
  pdfDocument = await getDocument({ data: documentBytes }).promise;
  await renderPdf();
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const msg = message as LltMessage;
  if (msg.type !== 'llt.pageSelection.get' || msg.tabId !== handlerTabId) return;

  const selection = readCurrentSelection(window, document);
  if (!selection) return;

  sendResponse({ text: selection.text, pageUrl: originalUrl });
});

zoomOut.addEventListener('click', () => {
  scale = Math.max(0.5, scale - 0.25);
  void renderPdf();
});

zoomIn.addEventListener('click', () => {
  scale = Math.min(3, scale + 0.25);
  void renderPdf();
});

download.addEventListener('click', () => {
  if (!documentBytes) return;
  const url = URL.createObjectURL(new Blob([documentBytes as BlobPart], { type: 'application/pdf' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = originalFilename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
});

nativeViewer.addEventListener('click', () => {
  void mimeHandler?.abortAndFallbackToNativeHandler();
});

void registerSelectionHotkey(window, {
  getHotkey,
  readSelection: () => {
    const selection = readCurrentSelection(window, document);
    return selection
      ? { text: selection.text, pageUrl: originalUrl || window.location.href }
      : null;
  },
  translateSelection: selection =>
    chrome.runtime.sendMessage({
      type: 'llt.selection.translate',
      text: selection.text,
      pageUrl: selection.pageUrl,
    } satisfies LltMessage),
  onError: error => {
    showStatus(error instanceof Error ? error.message : 'Could not translate the selection.');
  },
}).catch(error => {
  showStatus(error instanceof Error ? error.message : 'Could not load the translation hotkey.');
});

void loadPdf().catch(error => {
  showStatus(error instanceof Error ? error.message : 'Could not open PDF.');
});
