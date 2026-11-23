import {jest} from '@jest/globals';

const core = {
    getInput: jest.fn(),
    setSecret: jest.fn(),
    setOutput: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
    setFailed: jest.fn()
};
const glob = {
    create: jest.fn()
};
const fs = {
    accessSync: jest.fn(),
    statSync: jest.fn(),
    constants: {R_OK: 4}
};
const archive = {
    file: jest.fn()
};

jest.unstable_mockModule('@actions/core', () => core);
jest.unstable_mockModule('@actions/glob', () => glob);
jest.unstable_mockModule('fs', () => ({default: fs, ...fs}));
jest.unstable_mockModule('archiver', () => ({
    ZipArchive: jest.fn(() => {
        let destination;
        return {
            ...archive,
            on: jest.fn(),
            pipe: jest.fn(stream => {
                destination = stream;
            }),
            finalize: jest.fn(() => {
                setImmediate(() => {
                    destination.write(Buffer.from('zip-bytes'));
                    destination.end();
                });
                return Promise.resolve();
            })
        };
    })
}));

const {run} = await import('../src/main.js');

const API = 'https://api.lingohub.com/v2';
const PROJECT_ID = 'pr_0197c8f2-5a6b-7cde-8f12-3456789abcde';
const BRANCH_ID = 'prb_0197c8f2-5a6b-7cde-8f12-3456789abcd1';
const IMPORT_ID = 'rin_0197c8f2-5a6b-7cde-8f12-3456789abcd2';

function respond(status, body, headers = {}) {
    return new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json', ...headers}});
}

function importResult(status, extra = {}) {
    return {
        id: IMPORT_ID,
        object_type: 'IMPORT',
        status,
        status_details: null,
        texts_created: 0,
        texts_updated: 0,
        keys_deactivated: 0,
        keys_reactivated: 0,
        keys_renamed: 0,
        ...extra
    };
}

function requestedUrl(call) {
    return new URL(fetch.mock.calls[call][0]);
}

describe('Lingohub Upload Action', () => {
    const originalFetch = globalThis.fetch;
    const sleep = jest.fn(() => Promise.resolve());
    let inputs;

    beforeEach(() => {
        jest.clearAllMocks();
        inputs = {api_key: 'test-api-key', project_id: PROJECT_ID, files: '*.json', wait: 'true', timeout: '300'};
        core.getInput.mockImplementation((name, options) => {
            const value = inputs[name] || '';
            if (options?.required && !value) {
                throw new Error(`Input required and not supplied: ${name}`);
            }
            return value;
        });
        fs.statSync.mockReturnValue({size: 1024});
        glob.create.mockResolvedValue({glob: jest.fn().mockResolvedValue([`${process.cwd()}/locales/en.json`])});
        globalThis.fetch = jest.fn();
    });

    afterAll(() => {
        globalThis.fetch = originalFetch;
    });

    test('uploads the zip to the default branch and waits for the import', async () => {
        fetch
            .mockResolvedValueOnce(respond(200, {id: PROJECT_ID, default_branch_id: BRANCH_ID}))
            .mockResolvedValueOnce(respond(202, {data: importResult('QUEUED'), job_type: 'IMPORT', object_type: 'JOB'}))
            .mockResolvedValueOnce(respond(200, importResult('PROCESSING')))
            .mockResolvedValueOnce(respond(200, importResult('SUCCEEDED', {texts_created: 3, texts_updated: 2})));

        await run({sleep});

        expect(core.setFailed).not.toHaveBeenCalled();
        expect(core.setSecret).toHaveBeenCalledWith('test-api-key');
        expect(requestedUrl(0).href).toBe(`${API}/projects/${PROJECT_ID}`);
        expect(requestedUrl(1).href).toBe(`${API}/branches/${BRANCH_ID}/imports`);
        expect(requestedUrl(2).href).toBe(`${API}/imports/${IMPORT_ID}`);

        const upload = fetch.mock.calls[1][1];
        expect(upload.method).toBe('POST');
        expect(upload.redirect).toBe('error');
        expect(upload.headers).toEqual(expect.objectContaining({
            'Authorization': 'Bearer test-api-key',
            'User-Agent': 'lingohub-upload-action/2.0.0'
        }));
        const file = upload.body.get('file');
        expect(file.name).toBe('resources.zip');
        expect(file.type).toBe('application/zip');
        expect(Buffer.from(await file.arrayBuffer()).toString()).toBe('zip-bytes');
        expect(archive.file).toHaveBeenCalledWith(`${process.cwd()}/locales/en.json`, {name: 'locales/en.json'});

        expect(sleep).toHaveBeenCalledWith(2000);
        expect(core.setOutput).toHaveBeenCalledWith('import_id', IMPORT_ID);
        expect(core.setOutput).toHaveBeenLastCalledWith('status', 'SUCCEEDED');
        expect(core.info).toHaveBeenCalledWith(expect.stringContaining('3 texts created, 2 texts updated'));
    });

    test('uploads to the branch named in the branch input', async () => {
        inputs.branch = 'release';
        fetch
            .mockResolvedValueOnce(respond(200, {data: [{id: BRANCH_ID, name: 'release'}], has_more: false}))
            .mockResolvedValueOnce(respond(202, {data: importResult('QUEUED')}))
            .mockResolvedValueOnce(respond(200, importResult('SUCCEEDED')));

        await run({sleep});

        expect(core.setFailed).not.toHaveBeenCalled();
        const branches = requestedUrl(0);
        expect(branches.pathname).toBe(`/v2/projects/${PROJECT_ID}/branches`);
        expect(JSON.parse(branches.searchParams.get('filter')))
            .toEqual({where: {_and: [{'branch[name]': {_eq: 'release'}}]}});
        expect(requestedUrl(1).href).toBe(`${API}/branches/${BRANCH_ID}/imports`);
    });

    test('fails when the project has no branch of that name', async () => {
        inputs.branch = 'missing';
        fetch.mockResolvedValueOnce(respond(200, {data: [], has_more: false}));

        await run({sleep});

        expect(core.setFailed).toHaveBeenCalledWith(`Project ${PROJECT_ID} has no branch named "missing".`);
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    test('returns after the upload when wait is false', async () => {
        inputs.wait = 'false';
        fetch
            .mockResolvedValueOnce(respond(200, {default_branch_id: BRANCH_ID}))
            .mockResolvedValueOnce(respond(202, {data: importResult('QUEUED')}));

        await run({sleep});

        expect(core.setFailed).not.toHaveBeenCalled();
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(core.setOutput).toHaveBeenCalledWith('status', 'QUEUED');
    });

    test('names the files of a failed import and fails the step', async () => {
        const details = {code: 'INVALID_FILE', detail: 'Unexpected token in JSON at line 3'};
        fetch
            .mockResolvedValueOnce(respond(200, {default_branch_id: BRANCH_ID}))
            .mockResolvedValueOnce(respond(202, {data: importResult('QUEUED')}))
            .mockResolvedValueOnce(respond(200, importResult('FAILED', {status_details: details})))
            .mockResolvedValueOnce(respond(200, {
                data: [{file_path: 'locales/en.json', language_code: 'en', status: 'FAILED', status_details: details}],
                has_more: false
            }));

        await run({sleep});

        const entries = requestedUrl(3);
        expect(entries.pathname).toBe(`/v2/imports/${IMPORT_ID}/entries`);
        expect(JSON.parse(entries.searchParams.get('filter')))
            .toEqual({where: {_and: [{'import_entry[status]': {_eq: 'FAILED'}}]}});
        expect(core.error).toHaveBeenCalledWith('locales/en.json (en): INVALID_FILE: Unexpected token in JSON at line 3');
        expect(core.setOutput).toHaveBeenLastCalledWith('status', 'FAILED');
        expect(core.setFailed).toHaveBeenCalledWith(
            `Import ${IMPORT_ID} ended FAILED (INVALID_FILE: Unexpected token in JSON at line 3).`);
    });

    test('fails when the import is still running at the timeout', async () => {
        inputs.timeout = '5';
        let clock = 0;
        const now = () => clock;
        const advance = jest.fn(async ms => {
            clock += ms;
        });
        fetch
            .mockResolvedValueOnce(respond(200, {default_branch_id: BRANCH_ID}))
            .mockResolvedValueOnce(respond(202, {data: importResult('QUEUED')}))
            .mockImplementation(async () => respond(200, importResult('PROCESSING')));

        await run({sleep: advance, now});

        expect(advance).toHaveBeenCalledTimes(2);
        expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining(
            `Import ${IMPORT_ID} is still PROCESSING after 5 s.`));
    });

    test('explains that an API V1 project ID belongs to v1 of the action', async () => {
        inputs.project_id = 'pr_18JCETCbSz7e-40731';

        await run({sleep});

        expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('is an API V1 project ID'));
        expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('lingohub/upload-action@v1'));
        expect(fetch).not.toHaveBeenCalled();
    });

    test('reports failure when no files found', async () => {
        glob.create.mockResolvedValue({glob: jest.fn().mockResolvedValue([])});

        await run({sleep});

        expect(core.setFailed).toHaveBeenCalledWith('No files found matching pattern: *.json');
        expect(fetch).not.toHaveBeenCalled();
    });

    test('reports the problem details of a rejected upload', async () => {
        fetch
            .mockResolvedValueOnce(respond(200, {default_branch_id: BRANCH_ID}))
            .mockResolvedValueOnce(respond(413, {
                type: 'https://developers.lingohub.com/problems/payload_too_large',
                title: 'Payload too large',
                status: 413,
                detail: 'The upload is larger than 100 MB.',
                code: 'payload_too_large',
                request_id: 'req_123'
            }, {'Content-Type': 'application/problem+json'}));

        await run({sleep});

        expect(core.setFailed).toHaveBeenCalledWith(
            `POST /branches/${BRANCH_ID}/imports failed with HTTP 413: The upload is larger than 100 MB. `
            + '(code payload_too_large, request req_123)');
    });

    test('handles missing required input', async () => {
        inputs.api_key = '';

        await run({sleep});

        expect(core.setFailed).toHaveBeenCalledWith('Input required and not supplied: api_key');
    });
});
