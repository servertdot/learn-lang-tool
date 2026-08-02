import React, { useEffect, useRef, useState } from 'react';
import type { TranslateResponse } from '@package/shared';
import type { TranslationProvider } from '@package/shared';
import { requestViewInAnki } from '@src/lib/messaging-anki';
import {
  requestAddToAnkiWithPronunciation,
  playPronunciationPreviewInBrowser,
  requestPronunciationCancel,
  requestPronunciationPrepare,
  requestPronunciationStop,
  requestSpeechModelPackInstall,
} from '@src/lib/messaging-pronunciation';
import type { PronunciationRequest } from '@src/lib/audio-tts-provider';
import { createProductTranslationFacade } from '@src/lib/product-translator';
import { getLanguagePair, getTranslationProvider } from '@src/lib/storage';
import { takePendingSelection } from '@src/lib/pending-selection';
import { formatApproxSize } from '@src/lib/speech-model-pack-registry';
import { PopupTranslationResult } from './PopupTranslationResult';
import type { AnkiAddState, AnkiViewState } from '@src/components/AnkiActions';
import type { PronunciationControlState } from '@src/components/PronunciationControl';
import { stopBrowserSpeech } from '@src/lib/browser-speech';
import { buildPronunciationPolicy } from '@src/lib/tts-provider-registry';

type PopupState =
  | { kind: 'loading'; sourceText: string }
  | { kind: 'success'; result: TranslateResponse }
  | { kind: 'error'; message: string; sourceText: string }
  | { kind: 'empty' };

const translateFacade = createProductTranslationFacade();

export default function Popup() {
  const [state, setState] = useState<PopupState>({ kind: 'loading', sourceText: '' });
  const [ankiState, setAnkiState] = useState<AnkiAddState>('idle');
  const [ankiViewState, setAnkiViewState] = useState<AnkiViewState>('idle');
  const [ankiError, setAnkiError] = useState<string | null>(null);
  const [ankiNoteId, setAnkiNoteId] = useState<number | null>(null);
  const [pronunciationRequestId, setPronunciationRequestId] = useState<string | null>(null);
  const pronunciationRequestIdRef = useRef<string | null>(null);
  const [translationProvider, setActiveTranslationProvider] =
    useState<TranslationProvider | null>(null);
  const [pronunciationState, setPronunciationState] = useState<PronunciationControlState | null>(
    null,
  );
  const [ankiPronunciationState, setAnkiPronunciationState] =
    useState<PronunciationControlState | null>(null);
  const [pronunciationError, setPronunciationError] = useState<string | null>(null);
  const [pronunciationApproxSizeBytes, setPronunciationApproxSizeBytes] = useState<
    number | undefined
  >();
  const [pronunciationArtifactKey, setPronunciationArtifactKey] = useState<string | undefined>();
  const [pronunciationRequests, setPronunciationRequests] = useState<PronunciationRequest[]>();
  const [speechPackIdForInstall, setSpeechPackIdForInstall] = useState<string | undefined>();
  const [translatedPronunciationState, setTranslatedPronunciationState] =
    useState<PronunciationControlState | null>(null);
  const [translatedPronunciationError, setTranslatedPronunciationError] = useState<
    string | null
  >(null);
  const pronunciationPlaybackAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      const pending = await takePendingSelection();
      await chrome.action.setBadgeText({ text: '' });
      if (!pending) {
        setState({ kind: 'empty' });
        return;
      }

      setState({ kind: 'loading', sourceText: pending.text });
      try {
        const [pair, activeProvider] = await Promise.all([
          getLanguagePair(),
          getTranslationProvider(),
        ]);
        setActiveTranslationProvider(activeProvider);
        const result = await translateFacade.translate(
          {
            text: pending.text,
            from_code: pair.from_code,
            to_code: pair.to_code,
          },
          controller.signal,
        );
        setState({ kind: 'success', result });
        setPronunciationState('ready');
        setTranslatedPronunciationState('ready');
        setTranslatedPronunciationError(null);
        const requestId = crypto.randomUUID();
        setPronunciationRequestId(requestId);
        pronunciationRequestIdRef.current = requestId;
        if (result.can_add_to_anki) {
          setAnkiPronunciationState('preparing');
          setPronunciationRequests(
            buildPronunciationPolicy({
              text: result.source_text,
              language: result.from_code,
              translationProvider: activeProvider,
              purpose: 'anki',
            }).pronunciationRequests,
          );
          const response = await requestPronunciationPrepare({
            requestId: `${requestId}:anki`,
            text: result.source_text,
            language: result.from_code,
            translationProvider: activeProvider,
            purpose: 'anki',
          }, controller.signal);
          if (controller.signal.aborted) return;
          if (!response.ok) {
            setAnkiPronunciationState('failed');
            return;
          }
          setAnkiPronunciationState(response.uiState);
          setPronunciationApproxSizeBytes(response.approxSizeBytes);
          if (response.artifactKey) setPronunciationArtifactKey(response.artifactKey);
          setSpeechPackIdForInstall(response.speechModelPackId);
          if (response.pronunciationRequests) {
            setPronunciationRequests(response.pronunciationRequests);
          }
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Translation failed',
          sourceText: pending.text,
        });
      }
    })();

    return () => {
      controller.abort();
      pronunciationPlaybackAbortRef.current?.abort();
      if (pronunciationRequestIdRef.current) {
        for (const suffix of ['anki', 'original', 'translated']) {
          void requestPronunciationCancel(`${pronunciationRequestIdRef.current}:${suffix}`, {
            discardSession: true,
          });
        }
      }
      void requestPronunciationStop();
      stopBrowserSpeech(window);
    };
  }, []);

  const handleAddToAnki = async () => {
    if (state.kind !== 'success') return;

    const { result } = state;
    setAnkiState('adding');
    setAnkiError(null);

    try {
      if (ankiPronunciationState === 'pack_missing' && speechPackIdForInstall) {
        const sizeLabel = pronunciationApproxSizeBytes
          ? formatApproxSize(pronunciationApproxSizeBytes)
          : '';
        const ok = window.confirm(
          `Download the speech model pack${sizeLabel ? ` (${sizeLabel})` : ''} to add pronunciation to Anki? Selected text stays on your device.`,
        );
        if (!ok) {
          setAnkiState('idle');
          return;
        }
        await requestSpeechModelPackInstall(speechPackIdForInstall);
      }

      const addResult = await requestAddToAnkiWithPronunciation(
        {
          textFrom: result.source_text,
          textTo: result.translated_text,
          sentence: result.source_text,
        },
        {
          pronunciationRequests,
          artifactKey: pronunciationArtifactKey,
        },
      );
      setAnkiNoteId(addResult.status === 'synced' ? addResult.noteId : null);
      setAnkiState(addResult.status === 'synced' ? 'added' : 'queued');
      setAnkiViewState('idle');
    } catch (error) {
      setAnkiState('error');
      setAnkiError(error instanceof Error ? error.message : 'Could not add the card to Anki.');
    }
  };

  const handleViewInAnki = async () => {
    if (ankiNoteId === null) return;

    setAnkiViewState('opening');
    setAnkiError(null);

    try {
      await requestViewInAnki(ankiNoteId);
      setAnkiViewState('idle');
    } catch (error) {
      setAnkiViewState('error');
      setAnkiError(error instanceof Error ? error.message : 'Could not open the card in Anki.');
    }
  };

  const handlePlayPronunciation = async () => {
    if (state.kind !== 'success' || !pronunciationRequestId || !translationProvider) return;
    pronunciationPlaybackAbortRef.current?.abort();
    const controller = new AbortController();
    pronunciationPlaybackAbortRef.current = controller;
    setTranslatedPronunciationState(current => (current === 'playing' ? 'stopped' : current));
    setPronunciationState('playing');
    setPronunciationError(null);
    const result = await playPronunciationPreviewInBrowser(
      {
        requestId: `${pronunciationRequestId}:original`,
        text: state.result.source_text,
        language: state.result.from_code,
        translationProvider,
        purpose: 'preview',
      },
      window,
      controller.signal,
    );
    if (pronunciationPlaybackAbortRef.current !== controller) return;
    setPronunciationState(result.uiState);
    setPronunciationError(result.errorMessage ?? null);
    if (result.artifactKey) setPronunciationArtifactKey(result.artifactKey);
    if (result.pronunciationRequests) setPronunciationRequests(result.pronunciationRequests);
  };

  const handlePlayTranslatedPronunciation = async () => {
    if (state.kind !== 'success' || !pronunciationRequestId || !translationProvider) return;
    pronunciationPlaybackAbortRef.current?.abort();
    const controller = new AbortController();
    pronunciationPlaybackAbortRef.current = controller;

    setPronunciationState(current => (current === 'playing' ? 'stopped' : current));
    setTranslatedPronunciationState('playing');
    setTranslatedPronunciationError(null);

    const result = await playPronunciationPreviewInBrowser(
      {
        requestId: `${pronunciationRequestId}:translated`,
        text: state.result.translated_text,
        language: state.result.to_code,
        translationProvider,
        purpose: 'preview',
      },
      window,
      controller.signal,
    );
    if (pronunciationPlaybackAbortRef.current !== controller) return;
    setTranslatedPronunciationState(result.uiState);
    setTranslatedPronunciationError(result.errorMessage ?? null);
  };

  const handleStopTranslatedPronunciation = () => {
    pronunciationPlaybackAbortRef.current?.abort();
    pronunciationPlaybackAbortRef.current = null;
    if (pronunciationRequestId) {
      void requestPronunciationCancel(`${pronunciationRequestId}:translated`);
    }
    stopBrowserSpeech(window);
    void requestPronunciationStop();
    setTranslatedPronunciationState('stopped');
  };

  const retryAnkiPreparation = async () => {
    if (state.kind !== 'success' || !pronunciationRequestId || !translationProvider) return;
    setAnkiPronunciationState('preparing');
    const response = await requestPronunciationPrepare({
      requestId: `${pronunciationRequestId}:anki`,
      text: state.result.source_text,
      language: state.result.from_code,
      translationProvider,
      purpose: 'anki',
    });
    if (!response.ok) {
      setAnkiPronunciationState('failed');
      return;
    }
    setAnkiPronunciationState(response.uiState);
    setPronunciationApproxSizeBytes(response.approxSizeBytes);
    if (response.artifactKey) setPronunciationArtifactKey(response.artifactKey);
    setSpeechPackIdForInstall(response.speechModelPackId);
    if (response.pronunciationRequests) {
      setPronunciationRequests(response.pronunciationRequests);
    }
  };

  const handleInstallSpeechPack = async () => {
    if (!speechPackIdForInstall) return;
    const sizeLabel = pronunciationApproxSizeBytes
      ? formatApproxSize(pronunciationApproxSizeBytes)
      : '';
    const ok = window.confirm(
      `Download the speech model pack${sizeLabel ? ` (${sizeLabel})` : ''}? Selected text stays on your device.`,
    );
    if (!ok) return;
    setAnkiPronunciationState('preparing');
    const install = await requestSpeechModelPackInstall(speechPackIdForInstall);
    if (!install.ok) {
      setAnkiPronunciationState('failed');
      setAnkiError(install.error ?? 'Speech model pack download failed.');
      return;
    }
    await retryAnkiPreparation();
  };

  return (
    <main className="bg-white text-slate-950">
      {state.kind === 'empty' && (
        <section className="p-4">
          <p className="text-sm font-medium">Translate text from any page</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Select text, right-click it, then choose <strong>Translate selection</strong>. This
            also works in the browser PDF viewer.
          </p>
        </section>
      )}

      {state.kind === 'loading' && (
        <section className="p-4" role="status">
          <p className="text-sm font-semibold text-indigo-700">Translating…</p>
          {state.sourceText && (
            <p className="mt-3 line-clamp-4 text-xs leading-relaxed text-slate-500">
              {state.sourceText}
            </p>
          )}
        </section>
      )}

      {state.kind === 'success' && (
        <PopupTranslationResult
          result={state.result}
          ankiState={ankiState}
          ankiViewState={ankiViewState}
          ankiError={ankiError}
          ankiPronunciationState={ankiPronunciationState}
          onAddToAnki={() => void handleAddToAnki()}
          onViewInAnki={() => void handleViewInAnki()}
          onOpenSettings={() => void chrome.runtime.openOptionsPage()}
          pronunciationState={pronunciationState}
          pronunciationError={pronunciationError}
          pronunciationApproxSizeBytes={pronunciationApproxSizeBytes}
          translatedPronunciationState={translatedPronunciationState}
          translatedPronunciationError={translatedPronunciationError}
          onPlayPronunciation={() => void handlePlayPronunciation()}
          onStopPronunciation={() => {
            pronunciationPlaybackAbortRef.current?.abort();
            pronunciationPlaybackAbortRef.current = null;
            if (pronunciationRequestId) {
              void requestPronunciationCancel(`${pronunciationRequestId}:original`);
            }
            stopBrowserSpeech(window);
            void requestPronunciationStop();
            setPronunciationState('stopped');
          }}
          onRetryPronunciation={() => void handlePlayPronunciation()}
          onInstallSpeechPack={() => void handleInstallSpeechPack()}
          onPlayTranslatedPronunciation={() => void handlePlayTranslatedPronunciation()}
          onStopTranslatedPronunciation={handleStopTranslatedPronunciation}
          onRetryTranslatedPronunciation={() => void handlePlayTranslatedPronunciation()}
          onRetryAnkiPronunciation={() => void retryAnkiPreparation()}
        />
      )}

      {state.kind === 'error' && (
        <section className="p-4" role="alert">
          <p className="text-sm font-semibold text-rose-700">Couldn’t translate</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{state.message}</p>
          <button
            type="button"
            onClick={() => void chrome.runtime.openOptionsPage()}
            className="mt-3 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
          >
            Open settings
          </button>
        </section>
      )}
    </main>
  );
}
