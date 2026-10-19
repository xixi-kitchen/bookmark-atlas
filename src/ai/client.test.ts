import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  AI_CONFIG_STORAGE_KEY, AI_CREDENTIAL_STORAGE_KEY, AI_REQUEST_TIMEOUT_MS, clearLocalAISettings,
  hasAIOriginPermission, listAIModels, loadAIConfig, loadLocalAISettings, normalizeAIConfig,
  requestAIOriginPermission, requestOrganization, saveAIConfig, saveLocalAISettings, testAIConnection,
} from './client';
import { MAX_ORGANIZATION_RESPONSE_BYTES } from './plan';
import { createCredentialVault, localCredentialVault, type EncryptedAICredential } from './credentialVault';
import { deferred, memoryKeyStore, serialLocks } from './credentialVault.testHelpers';

const config = { baseUrl: 'https://model.example/v1', model: 'user-chosen-model' };
const request = { items: [{ id: 'one', title: 'Title', domain: 'example.test', description: 'Note' }], instruction: 'Group by subject' };
const plan = { groups: [{ title: 'Subject', items: [{ id: 'one', presentation: 'compact' }] }] };
const completion = (content = JSON.stringify(plan)) => ({ choices: [{ message: { content }, finish_reason: 'stop' }] });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
let contains: ReturnType<typeof vi.fn>;
let permissionRequest: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;
let storageGet: ReturnType<typeof vi.fn>;
let records: Record<string, unknown>;

beforeEach(() => {
  contains = vi.fn().mockResolvedValue(true);
  permissionRequest = vi.fn().mockResolvedValue(true);
  records = {};
  storageGet = vi.fn(async () => structuredClone(records));
  vi.stubGlobal('chrome', { permissions: { contains, request: permissionRequest }, storage: { local: {
    get: storageGet,
    set: vi.fn(async (values) => { Object.assign(records, structuredClone(values)); }),
    remove: vi.fn(async (keys: string[]) => { for (const key of keys) delete records[key]; }),
  }, sync: { set: vi.fn() }, session: { set: vi.fn() } } });
  // Exercise real encryption and the full client protocol; only persistence and
  // the browser lock service are in-memory substitutes in this jsdom suite.
  const vault = createCredentialVault({ crypto: webcrypto as unknown as Crypto, keyStore: memoryKeyStore().store, locks: serialLocks() });
  vi.spyOn(localCredentialVault, 'encrypt').mockImplementation(vault.encrypt);
  vi.spyOn(localCredentialVault, 'decrypt').mockImplementation(vault.decrypt);
  vi.spyOn(localCredentialVault, 'withLock').mockImplementation(vault.withLock);
  fetchMock = vi.fn().mockResolvedValue(response(completion()));
  vi.stubGlobal('fetch', fetchMock);
});

describe('local-only saved credentials', () => {
  it('explicitly saves only an endpoint-bound ciphertext in separate local keys', async () => {
    await saveLocalAISettings({ ...config, apiKey: ' mock-only-key ' });
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [AI_CONFIG_STORAGE_KEY]: config,
      [AI_CREDENTIAL_STORAGE_KEY]: { version: 2, algorithm: 'AES-GCM', baseUrl: config.baseUrl, iv: expect.any(String), ciphertext: expect.any(String) },
    });
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    expect(chrome.storage.session.set).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(JSON.stringify(records)).not.toContain('mock-only-key');
    expect(await loadLocalAISettings()).toEqual({ ...config, apiKey: 'mock-only-key' });
  });

  it('restores a saved key only for the exact normalized endpoint, including path', async () => {
    for (const baseUrl of ['https://elsewhere.example/v1', 'https://model.example/other']) {
      records = { [AI_CONFIG_STORAGE_KEY]: config, [AI_CREDENTIAL_STORAGE_KEY]: await localCredentialVault.encrypt(baseUrl, 'old-key') };
      expect(await loadLocalAISettings()).toEqual({ ...config, apiKey: '' });
    }
    records = { [AI_CONFIG_STORAGE_KEY]: config, [AI_CREDENTIAL_STORAGE_KEY]: await localCredentialVault.encrypt(config.baseUrl, 'saved-key') };
    expect(await loadLocalAISettings()).toEqual({ ...config, apiKey: 'saved-key' });
    expect(await loadAIConfig()).toEqual(config);
  });

  it('keeps legacy URL/model records usable but never trusts legacy extra keys', async () => {
    storageGet.mockResolvedValue({ [AI_CONFIG_STORAGE_KEY]: { ...config, apiKey: 'unbound-key' } });
    expect(await loadLocalAISettings()).toEqual({ ...config, apiKey: '' });
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ [AI_CONFIG_STORAGE_KEY]: config });
  });

  it('clears both AI local records without touching any other local or sync data', async () => {
    await saveLocalAISettings({ ...config, apiKey: 'first-key' });
    records.unrelated = { keep: true };
    await clearLocalAISettings();
    expect(chrome.storage.local.remove).toHaveBeenCalledWith([AI_CONFIG_STORAGE_KEY, AI_CREDENTIAL_STORAGE_KEY]);
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    expect(records).toEqual({ unrelated: { keep: true } });
    expect(await loadLocalAISettings()).toBeNull();
  });

  it('migrates a legacy plaintext key once and returns it only after ciphertext commit', async () => {
    records = { [AI_CONFIG_STORAGE_KEY]: config, [AI_CREDENTIAL_STORAGE_KEY]: { baseUrl: config.baseUrl, apiKey: 'legacy-test-key' } };
    const gate = deferred<void>();
    vi.mocked(chrome.storage.local.set).mockImplementationOnce(async (values) => {
      await gate.promise; Object.assign(records, structuredClone(values));
    });
    const loaded = loadLocalAISettings();
    let returned = false;
    void loaded.then(() => { returned = true; });
    await vi.waitFor(() => expect(chrome.storage.local.set).toHaveBeenCalledTimes(1));
    expect(returned).toBe(false);
    gate.resolve();
    expect(await loaded).toEqual({ ...config, apiKey: 'legacy-test-key' });
    expect(records[AI_CREDENTIAL_STORAGE_KEY]).toMatchObject({ version: 2, algorithm: 'AES-GCM' });
    expect(JSON.stringify(records)).not.toContain('legacy-test-key');
    expect(await loadLocalAISettings()).toEqual({ ...config, apiKey: 'legacy-test-key' });
    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
  });

  it('does not return legacy plaintext or erase it when migration encryption or persistence fails', async () => {
    const legacy = { baseUrl: config.baseUrl, apiKey: 'preserve-until-upgraded' };
    records = { [AI_CONFIG_STORAGE_KEY]: config, [AI_CREDENTIAL_STORAGE_KEY]: legacy };
    vi.mocked(localCredentialVault.encrypt).mockRejectedValueOnce(new Error('secret echo preserve-until-upgraded'));
    await expect(loadLocalAISettings()).rejects.toMatchObject({ code: 'storage_unavailable', message: 'storage_unavailable' });
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(records[AI_CREDENTIAL_STORAGE_KEY]).toEqual(legacy);
    vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(new Error('storage failure'));
    await expect(loadLocalAISettings()).rejects.toThrow('storage_unavailable');
    expect(records[AI_CREDENTIAL_STORAGE_KEY]).toEqual(legacy);
    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
  });

  it('does not silently hide corrupted saved credentials as missing settings', async () => {
    await saveLocalAISettings({ ...config, apiKey: 'saved-test-key' });
    const encrypted = records[AI_CREDENTIAL_STORAGE_KEY] as EncryptedAICredential;
    records[AI_CREDENTIAL_STORAGE_KEY] = { ...encrypted, ciphertext: btoa('damaged-not-a-real-ciphertext') };
    await expect(loadLocalAISettings()).rejects.toThrow('storage_unavailable');
    records[AI_CREDENTIAL_STORAGE_KEY] = { baseUrl: config.baseUrl, unexpected: 'not a credential' };
    await expect(loadLocalAISettings()).rejects.toThrow('storage_unavailable');
  });

  it('keeps a failed explicit save from overwriting existing saved settings', async () => {
    await saveLocalAISettings({ ...config, apiKey: 'previous-key' });
    const previous = structuredClone(records);
    vi.mocked(localCredentialVault.encrypt).mockRejectedValueOnce(new Error('unavailable'));
    await expect(saveLocalAISettings({ ...config, model: 'new-model', apiKey: 'new-key' })).rejects.toThrow('storage_unavailable');
    expect(records).toEqual(previous);
  });

  it('serializes a migration followed by clear so old plaintext never resurrects', async () => {
    records = { [AI_CONFIG_STORAGE_KEY]: config, [AI_CREDENTIAL_STORAGE_KEY]: { baseUrl: config.baseUrl, apiKey: 'legacy-key' } };
    const gate = deferred<void>();
    vi.mocked(chrome.storage.local.set).mockImplementationOnce(async (values) => { await gate.promise; Object.assign(records, structuredClone(values)); });
    const migration = loadLocalAISettings();
    await vi.waitFor(() => expect(chrome.storage.local.set).toHaveBeenCalledTimes(1));
    const cleared = clearLocalAISettings();
    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
    gate.resolve();
    await Promise.all([migration, cleared]);
    expect(records).toEqual({});
    expect(await loadLocalAISettings()).toBeNull();
  });

  it('serializes save and clear in request order without orphaning newer ciphertext', async () => {
    const gate = deferred<void>();
    vi.mocked(chrome.storage.local.set).mockImplementationOnce(async (values) => { await gate.promise; Object.assign(records, structuredClone(values)); });
    const saved = saveLocalAISettings({ ...config, apiKey: 'first-key' });
    await vi.waitFor(() => expect(chrome.storage.local.set).toHaveBeenCalledTimes(1));
    const cleared = clearLocalAISettings();
    const savedAfterClear = saveLocalAISettings({ ...config, apiKey: 'newest-key' });
    gate.resolve();
    await Promise.all([saved, cleared, savedAfterClear]);
    expect(await loadLocalAISettings()).toEqual({ ...config, apiKey: 'newest-key' });
    expect(JSON.stringify(records)).not.toContain('newest-key');
  });
});

describe('model discovery and real generation connectivity test', () => {
  it('fetches and deduplicates bounded model IDs using GET with no bookmark request body', async () => {
    fetchMock.mockResolvedValue(response({ data: [{ id: 'beta' }, { id: 'alpha' }, { id: 'alpha' }] }));
    expect(await listAIModels(config, 'test-key')).toEqual(['alpha', 'beta']);
    expect(fetchMock).toHaveBeenCalledWith('https://model.example/v1/models', expect.objectContaining({ method: 'GET', headers: { Authorization: 'Bearer test-key' }, redirect: 'error', credentials: 'omit' }));
    expect(fetchMock.mock.calls[0]![1]).not.toHaveProperty('body');
    expect(permissionRequest).not.toHaveBeenCalled();
  });

  it('performs an independent minimal completion for the chosen model, never selected metadata', async () => {
    fetchMock.mockResolvedValue(response(completion('OK')));
    await testAIConnection(config, 'test-key');
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ model: config.model, stream: false, store: false, messages: [{ role: 'user', content: 'Reply only with OK.' }] });
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('rejects invalid model listings and non-generating model responses', async () => {
    for (const result of [{}, { data: [{ id: '' }] }, { data: [{ id: 'x\nprivate' }] }, { data: Array.from({ length: 2001 }, () => ({ id: 'x' })) }]) {
      fetchMock.mockResolvedValue(response(result));
      await expect(listAIModels(config, 'test-key')).rejects.toMatchObject({ code: 'invalid_response' });
    }
    fetchMock.mockResolvedValue(response({ data: [{ id: 'model' }] }));
    await expect(testAIConnection(config, 'test-key')).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('requires exact permission, redacts errors, and cancels discovery', async () => {
    contains.mockResolvedValue(false);
    await expect(listAIModels(config, 'test-key')).rejects.toMatchObject({ code: 'permission_required' });
    expect(fetchMock).not.toHaveBeenCalled();
    contains.mockResolvedValue(true);
    fetchMock.mockRejectedValue(new Error('echo test-key'));
    await expect(testAIConnection(config, 'test-key')).rejects.toMatchObject({ message: 'network' });
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const abort = new AbortController();
    const pending = listAIModels(config, 'test-key', abort.signal);
    const checked = expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2)); abort.abort(); await checked;
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('AI configuration and host permission', () => {
  it('normalizes HTTPS base URL and preserves the user-selected model', () => {
    expect(normalizeAIConfig({ baseUrl: ' https://MODEL.example/v1/// ', model: ' custom-model ' })).toEqual({ ...config, model: 'custom-model', endpoint: 'https://model.example/v1/chat/completions', origin: 'https://model.example' });
  });

  it.each(['http://model.example/v1', 'https://localhost/v1', 'https://localhost./v1', 'https://127.0.0.1/v1', 'https://[::1]/v1', 'https://user:key@model.example/v1', 'https://model.example/v1?key=secret', 'https://model.example/v1?', 'https://model.example/v1#key', 'https://model.example/v1#', 'https://model.example/v1/chat/completions/', '/v1', 'javascript:alert(1)'])('rejects invalid or credential-bearing configuration %s', (baseUrl) => {
    expect(() => normalizeAIConfig({ ...config, baseUrl })).toThrow('invalid_config');
  });

  it('requests only the configured origin directly and never a wildcard host', async () => {
    const pending = requestAIOriginPermission(config);
    expect(permissionRequest).toHaveBeenCalledWith({ origins: ['https://model.example/*'] });
    expect(contains).not.toHaveBeenCalled();
    expect(await pending).toBe(true);
    expect(await hasAIOriginPermission(config)).toBe(true);
    expect(contains).toHaveBeenCalledWith({ origins: ['https://model.example/*'] });
  });

  it('returns a declined permission without starting a request', async () => {
    permissionRequest.mockResolvedValue(false);
    expect(await requestAIOriginPermission(config)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('saves only base URL and model in local storage, never an extra key', async () => {
    await saveAIConfig({ ...config, apiKey: 'never-save-this' } as typeof config);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ [AI_CONFIG_STORAGE_KEY]: config });
    storageGet.mockResolvedValue({ [AI_CONFIG_STORAGE_KEY]: { ...config, apiKey: 'legacy-extra' } });
    expect(await loadAIConfig()).toEqual(config);
  });

  it('does not use localStorage or sync when extension APIs are absent', async () => {
    vi.stubGlobal('chrome', undefined);
    expect(await loadAIConfig()).toBeNull();
    expect(await hasAIOriginPermission(config)).toBe(false);
    await expect(saveAIConfig(config)).rejects.toMatchObject({ code: 'storage_unavailable' });
    await expect(requestAIOriginPermission(config)).rejects.toMatchObject({ code: 'permission_unavailable' });
    expect(localStorage.getItem(AI_CONFIG_STORAGE_KEY)).toBeNull();
  });
});

describe('compatible organization client', () => {
  it('sends only whitelisted metadata and uses a non-stored, non-streaming JSON request', async () => {
    const extraItem = { ...request.items[0]!, url: 'https://example.test/private?token=hidden#private', path: '/private', history: ['never-send'] };
    expect(await requestOrganization(config, 'test-key', { ...request, items: [extraItem] })).toEqual(plan);
    const [endpoint, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe('https://model.example/v1/chat/completions');
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer', headers: { Authorization: 'Bearer test-key' } });
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ model: config.model, store: false, stream: false });
    expect(JSON.parse(body.messages[1].content)).toEqual(request);
    expect(init.body).not.toContain('hidden');
    expect(init.body).not.toContain('never-send');
    expect(init.body).not.toContain('test-key');
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(permissionRequest).not.toHaveBeenCalled();
  });

  it('requires both a key and already granted exact-origin permission', async () => {
    await expect(requestOrganization(config, '', request)).rejects.toMatchObject({ code: 'missing_key' });
    contains.mockResolvedValue(false);
    await expect(requestOrganization(config, 'test-key', request)).rejects.toMatchObject({ code: 'permission_required' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(permissionRequest).not.toHaveBeenCalled();
  });

  it.each([[401, 'unauthorized'], [403, 'unauthorized'], [429, 'rate_limited'], [500, 'http_error']])('maps HTTP %s without exposing provider body or key', async (status, code) => {
    fetchMock.mockResolvedValue(response({ error: 'provider echoes test-key and private title' }, status as number));
    await expect(requestOrganization(config, 'test-key', request)).rejects.toMatchObject({ code, message: code });
  });

  it('replaces unsafe network errors with a stable code', async () => {
    fetchMock.mockRejectedValue(new Error('https://model.example?key=test-key private data'));
    await expect(requestOrganization(config, 'test-key', request)).rejects.toMatchObject({ code: 'network', message: 'network' });
  });

  it('rejects invalid API envelopes, refusals, truncation and unauthorized target IDs', async () => {
    for (const body of [
      {}, { choices: { 0: completion().choices[0] } },
      { choices: [{ message: { content: null } }] },
      { choices: [{ message: { content: JSON.stringify(plan), refusal: 'No' } }] },
      { choices: [{ message: { content: JSON.stringify(plan), tool_calls: [] } }] },
      { choices: [{ message: { content: JSON.stringify(plan) }, finish_reason: 'length' }] },
    ]) {
      fetchMock.mockResolvedValue(response(body));
      await expect(requestOrganization(config, 'test-key', request)).rejects.toMatchObject({ code: 'invalid_response' });
    }
    fetchMock.mockResolvedValue(response(completion(JSON.stringify({ groups: [{ title: 'x', items: [{ id: 'unknown' }] }] }))));
    await expect(requestOrganization(config, 'test-key', request)).rejects.toMatchObject({ code: 'invalid_plan' });
    fetchMock.mockResolvedValue(new Response('not JSON'));
    await expect(requestOrganization(config, 'test-key', request)).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('bounds streamed bytes even if content-length is absent or false', async () => {
    for (const headers of [{}, { 'content-length': '1' }] as HeadersInit[]) {
      fetchMock.mockResolvedValue(new Response('x'.repeat(MAX_ORGANIZATION_RESPONSE_BYTES + 1), { headers }));
      await expect(requestOrganization(config, 'test-key', request)).rejects.toMatchObject({ code: 'response_too_large' });
    }
    fetchMock.mockResolvedValue(new Response('small', { headers: { 'content-length': String(MAX_ORGANIZATION_RESPONSE_BYTES + 1) } }));
    await expect(requestOrganization(config, 'test-key', request)).rejects.toMatchObject({ code: 'response_too_large' });
  });

  it('cancels without waiting for an uncooperative fetch and rejects an already cancelled request', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const result = requestOrganization(config, 'test-key', request, controller.signal);
    const checked = expect(result).rejects.toMatchObject({ code: 'cancelled' });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    controller.abort();
    await checked;
    await expect(requestOrganization(config, 'test-key', request, controller.signal)).rejects.toMatchObject({ code: 'cancelled' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('times out after 45 seconds and aborts the underlying request', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const result = requestOrganization(config, 'test-key', request);
    const checked = expect(result).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(AI_REQUEST_TIMEOUT_MS);
    await checked;
    expect((fetchMock.mock.calls[0]![1] as RequestInit).signal?.aborted).toBe(true);
  });
});
