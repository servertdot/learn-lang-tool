import type {
  PronunciationSessionState,
  PronunciationWorkflowInput,
} from './pronunciation-workflow';

export interface PronunciationPreviewDependencies {
  prepare(
    input: PronunciationWorkflowInput,
    signal: AbortSignal,
  ): Promise<PronunciationSessionState>;
  playArtifact(artifactKey: string, signal: AbortSignal): Promise<void>;
  playWebSpeech(text: string, language: string, signal: AbortSignal): Promise<void>;
  stop(): Promise<void>;
}

function stopped(input: PronunciationWorkflowInput): PronunciationSessionState {
  return {
    requestId: input.requestId,
    uiState: 'stopped',
    errorCode: 'request_cancelled',
    errorMessage: 'Pronunciation was stopped.',
  };
}

/** Bridges background artifact preparation/playback with page-owned Web Speech. */
export async function playPronunciationPreview(
  input: PronunciationWorkflowInput,
  dependencies: PronunciationPreviewDependencies,
  callerSignal?: AbortSignal,
): Promise<PronunciationSessionState> {
  const signal = callerSignal ?? new AbortController().signal;
  const excludedProviderIds = new Set(input.excludedProviderIds ?? []);
  await dependencies.stop();

  while (!signal.aborted) {
    let state: PronunciationSessionState;
    try {
      state = await dependencies.prepare(
        { ...input, excludedProviderIds: [...excludedProviderIds] },
        signal,
      );
    } catch (error) {
      if (signal.aborted) return stopped(input);
      return {
        requestId: input.requestId,
        uiState: 'failed',
        errorCode: 'generation_failed',
        errorMessage: error instanceof Error ? error.message : 'Pronunciation preparation failed.',
      };
    }
    if (signal.aborted || state.errorCode === 'request_cancelled') return stopped(input);
    if (state.uiState !== 'ready') return state;

    try {
      if (state.playbackKind === 'artifact' && state.artifactKey) {
        await dependencies.playArtifact(state.artifactKey, signal);
      } else if (state.playbackKind === 'web_speech') {
        await dependencies.playWebSpeech(input.text, input.language, signal);
      } else {
        return {
          ...state,
          uiState: 'failed',
          errorCode: 'generation_failed',
          errorMessage: 'Pronunciation playback data is unavailable.',
        };
      }
      return { ...state, uiState: 'stopped' };
    } catch (error) {
      if (signal.aborted) return stopped(input);
      if (state.playbackKind === 'artifact' && state.providerId) {
        excludedProviderIds.add(state.providerId);
        continue;
      }
      return {
        ...state,
        uiState: 'failed',
        errorCode: 'generation_failed',
        errorMessage: error instanceof Error ? error.message : 'Pronunciation playback failed.',
      };
    }
  }

  return stopped(input);
}
