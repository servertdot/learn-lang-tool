import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_ANKI_SETTINGS, createAnkiNote } from './anki';
import {
  addNoteWithAnkiConnect,
  browseNoteWithAnkiConnect,
  findQueuedNoteIdsWithAnkiConnect,
  getCollectionInfoWithAnkiConnect,
  getModelFieldNamesWithAnkiConnect,
  removeAnkiQueueTagWithAnkiConnect,
} from './anki-connect';

function jsonResponse(result: unknown, error: string | null = null): Response {
  return new Response(JSON.stringify({ result, error }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const note = createAnkiNote(DEFAULT_ANKI_SETTINGS, {
  textFrom: 'hello',
  textTo: 'привет',
  sentence: 'Hello there.',
});

describe('AnkiConnect client', () => {
  it('requests origin permission before adding a note', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ permission: 'granted', requireApiKey: false, version: 6 }),
      )
      .mockResolvedValueOnce(jsonResponse(12345));

    await expect(
      addNoteWithAnkiConnect(DEFAULT_ANKI_SETTINGS, note, { fetch: fetchMock }),
    ).resolves.toBe(12345);

    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(firstBody).toEqual({ action: 'requestPermission', version: 6 });
    expect(secondBody).toEqual({
      action: 'addNote',
      version: 6,
      params: { note },
    });
  });

  it('attaches base64 audio with a deterministic filename and mapped fields', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ permission: 'granted', requireApiKey: false, version: 6 }),
      )
      .mockResolvedValueOnce(jsonResponse(99));

    const audio = {
      filename: 'llt_abc123.mp3',
      data: 'UklGRg==',
      fields: ['Reading'],
    };

    await expect(
      addNoteWithAnkiConnect(DEFAULT_ANKI_SETTINGS, note, { fetch: fetchMock }, audio),
    ).resolves.toBe(99);

    const body = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(body).toEqual({
      action: 'addNote',
      version: 6,
      params: {
        note: {
          ...note,
          audio: [audio],
        },
      },
    });
  });

  it('stops when Anki denies origin permission', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ permission: 'denied' }));
    await expect(
      addNoteWithAnkiConnect(DEFAULT_ANKI_SETTINGS, note, { fetch: fetchMock }),
    ).rejects.toMatchObject({ code: 'permission_denied' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('reports an API key requirement before adding', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ permission: 'granted', requireApiKey: true, version: 6 }),
    );
    await expect(
      addNoteWithAnkiConnect(DEFAULT_ANKI_SETTINGS, note, { fetch: fetchMock }),
    ).rejects.toMatchObject({ code: 'api_key_required' });
  });

  it('rejects a malformed permission response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(null));
    await expect(
      addNoteWithAnkiConnect(DEFAULT_ANKI_SETTINGS, note, { fetch: fetchMock }),
    ).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('surfaces AnkiConnect API errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ permission: 'granted', requireApiKey: false, version: 6 }),
      )
      .mockResolvedValueOnce(jsonResponse(null, 'deck was not found: English'));
    await expect(
      addNoteWithAnkiConnect(DEFAULT_ANKI_SETTINGS, note, { fetch: fetchMock }),
    ).rejects.toMatchObject({
      code: 'api_error',
      message: 'deck was not found: English',
    });
  });

  it('finds an already-synced queued note by its private tag', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ permission: 'granted' }))
      .mockResolvedValueOnce(jsonResponse([123]));

    await expect(
      findQueuedNoteIdsWithAnkiConnect(DEFAULT_ANKI_SETTINGS, 'queue-id', {
        fetch: fetchMock,
      }),
    ).resolves.toEqual([123]);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toMatchObject({
      action: 'findNotes',
      params: { query: 'tag:llt_queue_queueid' },
    });
  });

  it('removes the private queue tag after a successful sync', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ permission: 'granted' }))
      .mockResolvedValueOnce(jsonResponse(null));

    await removeAnkiQueueTagWithAnkiConnect(DEFAULT_ANKI_SETTINGS, 123, 'queue-id', {
      fetch: fetchMock,
    });

    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toMatchObject({
      action: 'removeTags',
      params: { notes: [123], tags: 'llt_queue_queueid' },
    });
  });

  it('opens Browse filtered to the created note', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ permission: 'granted', requireApiKey: false, version: 6 }),
      )
      .mockResolvedValueOnce(jsonResponse([91, 92]));

    await expect(
      browseNoteWithAnkiConnect(DEFAULT_ANKI_SETTINGS, 12345, { fetch: fetchMock }),
    ).resolves.toEqual([91, 92]);

    const body = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(body).toEqual({
      action: 'guiBrowse',
      version: 6,
      params: { query: 'nid:12345' },
    });
  });

  it('loads deck and model names from the Anki collection', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ permission: 'granted', requireApiKey: false, version: 6 }),
      )
      .mockResolvedValueOnce(jsonResponse(['Default', 'English']))
      .mockResolvedValueOnce(jsonResponse(['Basic', 'Basic (and reversed card)']));

    await expect(
      getCollectionInfoWithAnkiConnect(DEFAULT_ANKI_SETTINGS, { fetch: fetchMock }),
    ).resolves.toEqual({
      deckNames: ['Default', 'English'],
      modelNames: ['Basic', 'Basic (and reversed card)'],
    });

    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({
      action: 'deckNames',
      version: 6,
    });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body as string)).toEqual({
      action: 'modelNames',
      version: 6,
    });
  });

  it('loads fields for the selected Anki model', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ permission: 'granted', requireApiKey: false, version: 6 }),
      )
      .mockResolvedValueOnce(jsonResponse(['Front', 'Back', 'Sentence']));

    await expect(
      getModelFieldNamesWithAnkiConnect(
        DEFAULT_ANKI_SETTINGS,
        'Basic with context',
        { fetch: fetchMock },
      ),
    ).resolves.toEqual(['Front', 'Back', 'Sentence']);

    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string)).toEqual({
      action: 'modelFieldNames',
      version: 6,
      params: { modelName: 'Basic with context' },
    });
  });
});
