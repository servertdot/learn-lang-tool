import React, { useEffect, useRef, useState } from 'react';
import type { TranslateResponse } from '@package/shared';
import { requestViewInAnki } from '@src/lib/messaging-anki';
import {
  requestAddToAnkiWithPronunciation,
  requestPronunciationPlay,
  requestPronunciationPrepare,
  requestPronunciationStop,
  requestSpeechModelPackInstall,
} from '@src/lib/messaging-pronunciation';
import type { PronunciationRequest } from '@src/lib/audio-tts-provider';
import { createProductTranslationFacade } from '@src/lib/product-translator';
import { getLanguagePair } from '@src/lib/storage';
import { takePendingSelection } from '@src/lib/pending-selection';
import { formatApproxSize } from '@src/lib/speech-model-pack-registry';
import { PopupTranslationResult } from './PopupTranslationResult';
import type { AnkiAddState, AnkiViewState } from '@src/components/AnkiActions';
import type { PronunciationControlState } from '@src/components/PronunciationControl';
import {
  canUseBrowserSpeech,
  speakWithBrowser,
  stopBrowserSpeech,
} from '@src/lib/browser-speech';

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
  const [pronunciationState, setPronunciationState] = useState<PronunciationControlState | null>(
    null,
  );
  const [pronunciationError, setPronunciationError] = useState<string | null>(null);
  const [pronunciationApproxSizeBytes, setPronunciationApproxSizeBytes] = useState<
    number | undefined
  >();
  const [pronunciationArtifactKey, setPronunciationArtifactKey] = useState<string | undefined>();
  const [pronunciationRequest, setPronunciationRequest] = useState<
    PronunciationRequest | undefined
  >();
  const [speechPackIdForInstall, setSpeechPackIdForInstall] = useState<string | undefined>();
  const [translatedPronunciationState, setTranslatedPronunciationState] =
    useState<PronunciationControlState | null>(null);
  const [translatedPronunciationError, setTranslatedPronunciationError] = useState<
    string | null
  >(null);
  const translatedSpeechRunRef = useRef(0);

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
        const pair = await getLanguagePair();
        const result = await translateFacade.translate(
          {
            text: pending.text,
            from_code: pair.from_code,
            to_code: pair.to_code,
          },
          controller.signal,
        );
        setState({ kind: 'success', result });
        const translatedSpeechSupported = canUseBrowserSpeech(window);
        setTranslatedPronunciationState(translatedSpeechSupported ? 'ready' : 'unsupported');
        setTranslatedPronunciationError(
          translatedSpeechSupported ? null : 'Speech playback is unavailable in this browser.',
        );
        if (result.can_add_to_anki) {
          const requestId = crypto.randomUUID();
          setPronunciationRequestId(requestId);
          setPronunciationState('preparing');
          const response = await requestPronunciationPrepare(requestId, result);
          if (controller.signal.aborted) return;
          if (!response.ok) {
            setPronunciationState('failed');
            setPronunciationError(response.error);
            return;
          }
          setPronunciationState(response.uiState);
          setPronunciationError(response.errorMessage ?? null);
          setPronunciationApproxSizeBytes(response.approxSizeBytes);
          setPronunciationArtifactKey(response.artifactKey);
          setSpeechPackIdForInstall(response.speechModelPackId);
          setPronunciationRequest(response.pronunciationRequest);
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
      void requestPronunciationStop();
      translatedSpeechRunRef.current += 1;
      stopBrowserSpeech(window);
    };
  }, []);

  const handleAddToAnki = async () => {
    if (state.kind !== 'success') return;

    const { result } = state;
    setAnkiState('adding');
    setAnkiError(null);

    try {
      if (pronunciationState === 'pack_missing' && speechPackIdForInstall) {
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
          pronunciationRequest,
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
    if (!pronunciationArtifactKey) return;
    translatedSpeechRunRef.current += 1;
    stopBrowserSpeech(window);
    setTranslatedPronunciationState(current => (current === 'playing' ? 'stopped' : current));
    setPronunciationState('playing');
    const response = await requestPronunciationPlay(pronunciationArtifactKey);
    if (!response.ok) {
      setPronunciationState('failed');
      setPronunciationError(response.error);
      return;
    }
    setPronunciationState('stopped');
  };

  const handlePlayTranslatedPronunciation = async () => {
    if (state.kind !== 'success') return;
    const runId = translatedSpeechRunRef.current + 1;
    translatedSpeechRunRef.current = runId;

    setPronunciationState(current => (current === 'playing' ? 'stopped' : current));
    setTranslatedPronunciationState('playing');
    setTranslatedPronunciationError(null);

    try {
      await requestPronunciationStop().catch(() => undefined);
      if (translatedSpeechRunRef.current !== runId) return;
      await speakWithBrowser(state.result.translated_text, state.result.to_code, window);
      if (translatedSpeechRunRef.current === runId) {
        setTranslatedPronunciationState('stopped');
      }
    } catch (error) {
      if (translatedSpeechRunRef.current !== runId) return;
      setTranslatedPronunciationState('failed');
      setTranslatedPronunciationError(
        error instanceof Error ? error.message : 'Could not play the translated text.',
      );
    }
  };

  const handleStopTranslatedPronunciation = () => {
    translatedSpeechRunRef.current += 1;
    stopBrowserSpeech(window);
    setTranslatedPronunciationState('stopped');
  };

  const handleRetryPronunciation = async () => {
    if (state.kind !== 'success' || !pronunciationRequestId) return;
    setPronunciationState('preparing');
    setPronunciationError(null);
    const response = await requestPronunciationPrepare(pronunciationRequestId, state.result);
    if (!response.ok) {
      setPronunciationState('failed');
      setPronunciationError(response.error);
      return;
    }
    setPronunciationState(response.uiState);
    setPronunciationError(response.errorMessage ?? null);
    setPronunciationApproxSizeBytes(response.approxSizeBytes);
    setPronunciationArtifactKey(response.artifactKey);
    setSpeechPackIdForInstall(response.speechModelPackId);
    setPronunciationRequest(response.pronunciationRequest);
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
    setPronunciationState('preparing');
    const install = await requestSpeechModelPackInstall(speechPackIdForInstall);
    if (!install.ok) {
      setPronunciationState('failed');
      setPronunciationError(install.error ?? 'Speech model pack download failed.');
      return;
    }
    await handleRetryPronunciation();
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
            void requestPronunciationStop();
            setPronunciationState('stopped');
          }}
          onRetryPronunciation={() => void handleRetryPronunciation()}
          onInstallSpeechPack={() => void handleInstallSpeechPack()}
          onPlayTranslatedPronunciation={() => void handlePlayTranslatedPronunciation()}
          onStopTranslatedPronunciation={handleStopTranslatedPronunciation}
          onRetryTranslatedPronunciation={() => void handlePlayTranslatedPronunciation()}
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
