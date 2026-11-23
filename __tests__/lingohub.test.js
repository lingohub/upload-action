import {jest} from '@jest/globals';
import {createClient, LingohubError, parseBoolean, parseTimeout, requireProjectId} from '../src/lingohub.js';

function respond(status, body, headers = {}) {
    return new Response(body === undefined ? null : JSON.stringify(body),
        {status, headers: {'Content-Type': 'application/json', ...headers}});
}

describe('Lingohub API V2 client', () => {
    const originalFetch = globalThis.fetch;
    const sleep = jest.fn(() => Promise.resolve());
    let client;

    beforeEach(() => {
        jest.clearAllMocks();
        globalThis.fetch = jest.fn();
        client = createClient({apiKey: 'key', userAgent: 'test-agent/1.0', sleep});
    });

    afterAll(() => {
        globalThis.fetch = originalFetch;
    });

    test('retries a read after 429 using Retry-After', async () => {
        fetch
            .mockResolvedValueOnce(respond(429, {code: 'rate_limited'}, {'Retry-After': '7'}))
            .mockResolvedValueOnce(respond(200, {ok: true}));

        await expect(client.get('/projects/x')).resolves.toEqual({ok: true});

        expect(sleep).toHaveBeenCalledWith(7000);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    test('retries a read after a network error and a 503', async () => {
        fetch
            .mockRejectedValueOnce(new TypeError('fetch failed'))
            .mockResolvedValueOnce(respond(503, {}))
            .mockResolvedValueOnce(respond(200, {ok: true}));

        await expect(client.get('/imports/x')).resolves.toEqual({ok: true});

        expect(sleep.mock.calls).toEqual([[1000], [2000]]);
    });

    test('gives up after three retries', async () => {
        fetch.mockImplementation(async () => respond(503, {detail: 'Maintenance', code: 'service_unavailable'}));

        await expect(client.get('/imports/x')).rejects
            .toThrow('GET /imports/x failed with HTTP 503: Maintenance (code service_unavailable)');

        expect(fetch).toHaveBeenCalledTimes(4);
    });

    test('does not retry a write after a server error', async () => {
        fetch.mockResolvedValueOnce(respond(503, {detail: 'Maintenance'}));

        await expect(client.post('/branches/b/exports', {})).rejects.toThrow('HTTP 503');

        expect(fetch).toHaveBeenCalledTimes(1);
    });

    test('retries a write after 429, which the API answers before doing anything', async () => {
        fetch
            .mockResolvedValueOnce(respond(429, {}))
            .mockResolvedValueOnce(respond(202, {data: {id: 'exp_1'}}));

        await expect(client.post('/branches/b/exports', {})).resolves.toEqual({data: {id: 'exp_1'}});
    });

    test('does not retry a write after a network error', async () => {
        fetch.mockRejectedValueOnce(new TypeError('fetch failed', {cause: new Error('ECONNRESET')}));

        await expect(client.post('/branches/b/exports', {})).rejects
            .toThrow('POST /branches/b/exports failed: ECONNRESET');
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    test('lists the rejected fields and hints at the API key on 401', async () => {
        fetch.mockResolvedValueOnce(respond(401, {
            title: 'Unauthorized',
            detail: 'The API key is invalid.',
            code: 'unauthenticated',
            errors: [{pointer: '#/language_codes/0', detail: 'unknown language'}]
        }));

        const error = await client.get('/projects/x').catch(e => e);

        expect(error).toBeInstanceOf(LingohubError);
        expect(error.status).toBe(401);
        expect(error.code).toBe('unauthenticated');
        expect(error.message).toBe('GET /projects/x failed with HTTP 401: The API key is invalid. (code unauthenticated)\n'
            + '  - #/language_codes/0: unknown language\n'
            + 'Check that api_key holds a valid LingoHub API key.');
    });

    test('reports a body that is not JSON', async () => {
        fetch.mockResolvedValueOnce(new Response('<html>Bad gateway</html>', {status: 400}));

        await expect(client.post('/x', {})).rejects.toThrow('POST /x failed with HTTP 400: <html>Bad gateway</html>');
    });

    test('sends JSON bodies with the API key and refuses redirects', async () => {
        fetch.mockResolvedValueOnce(respond(202, {data: {}}));

        await client.post('/branches/b/exports', {language_codes: ['de']});

        const [url, init] = fetch.mock.calls[0];
        expect(url.href).toBe('https://api.lingohub.com/v2/branches/b/exports');
        expect(init.redirect).toBe('error');
        expect(init.body).toBe('{"language_codes":["de"]}');
        expect(init.headers).toEqual({
            'Authorization': 'Bearer key',
            'Accept': 'application/json',
            'User-Agent': 'test-agent/1.0',
            'Content-Type': 'application/json'
        });
    });
});

describe('input parsing', () => {
    test('accepts an API V2 project ID', () => {
        expect(requireProjectId('pr_0197C8F2-5a6b-7cde-8f12-3456789abcde')).toBe('pr_0197C8F2-5a6b-7cde-8f12-3456789abcde');
    });

    test('rejects other project IDs with a hint to Copy ID', () => {
        expect(() => requireProjectId('my-project')).toThrow('Open the project in LingoHub and choose Copy ID from its menu.');
    });

    test('parses timeouts in whole seconds', () => {
        expect(parseTimeout('')).toBe(300000);
        expect(parseTimeout('45')).toBe(45000);
        expect(() => parseTimeout('1.5')).toThrow('timeout must be a whole number of seconds, got "1.5".');
        expect(() => parseTimeout('0')).toThrow(LingohubError);
    });

    test('parses booleans', () => {
        expect(parseBoolean('', 'wait', true)).toBe(true);
        expect(parseBoolean('False', 'wait', true)).toBe(false);
        expect(() => parseBoolean('sometimes', 'wait', true)).toThrow('wait must be true or false, got "sometimes".');
    });
});
