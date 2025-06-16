const core = require('@actions/core');
const glob = require('@actions/glob');
const fetch = require('node-fetch');
const fs = require('fs');

// Mock dependencies
jest.mock('@actions/core');
jest.mock('@actions/glob');
jest.mock('node-fetch');
jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    createReadStream: jest.fn().mockReturnValue('file-stream'),
    accessSync: jest.fn(),
    statSync: jest.fn().mockReturnValue({ size: 1024 }),
    constants: { R_OK: 4 }
}));

jest.mock('archiver', () => {
    return jest.fn(() => {
        const events = {};
        return {
            file: jest.fn(),
            pipe: jest.fn().mockReturnThis(),
            finalize: jest.fn().mockImplementation(function () {
                // Simulate async finalize and emit 'finish'
                setImmediate(() => {
                    if (events['finish']) events['finish']();
                });
                return Promise.resolve();
            }),
            on: (event, cb) => { events[event] = cb; },
            emit: (event, ...args) => { if (events[event]) events[event](...args); }
        };
    });
});

// Import the run function directly
const { run } = require('../src/index');

describe('Lingohub Upload Action', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Setup default mocks
        core.getInput.mockImplementation((name) => {
            switch (name) {
                case 'api_key':
                    return 'test-api-key';
                case 'project_id':
                    return 'pr_18JCETCbSz7e-40731';
                case 'files':
                    return '*.json';
                default:
                    return '';
            }
        });

        // Mock glob to return some test files
        const mockGlobber = {
            glob: jest.fn().mockResolvedValue(['test1.json', 'test2.json'])
        };
        glob.create.mockResolvedValue(mockGlobber);

        // Mock successful fetch response
        const mockResponse = {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: jest.fn().mockResolvedValue({success: true})
        };
        fetch.mockResolvedValue(mockResponse);
    });

    test('successfully uploads files as a zip', async () => {
        await run();

        // Verify URL has correct format including dummyWorkspaceUrl
        const expectedUrl = `https://api.lingohub.com/v1/dummyWorkspaceUrl/projects/pr_18JCETCbSz7e-40731/resources/zip`;
        expect(fetch).toHaveBeenCalledWith(
            expectedUrl,
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    'Authorization': 'Bearer test-api-key'
                })
            })
        );
        expect(core.info).toHaveBeenCalledWith('Successfully uploaded zip with all files.');
        expect(core.setFailed).not.toHaveBeenCalled();
    });

    test('reports failure when no files found', async () => {
        const mockGlobber = {
            glob: jest.fn().mockResolvedValue([])
        };
        glob.create.mockResolvedValue(mockGlobber);

        await run();

        expect(core.setFailed).toHaveBeenCalledWith('No files found matching pattern: *.json');
        expect(fetch).not.toHaveBeenCalled();
    });

    test('handles API error responses', async () => {
        const errorResponse = {
            ok: false,
            status: 400,
            statusText: 'Bad Request',
            json: jest.fn().mockResolvedValue({message: 'Invalid project ID'})
        };
        fetch.mockResolvedValue(errorResponse);

        await run();

        expect(core.error).toHaveBeenCalledWith('Response status: 400');
        expect(core.error).toHaveBeenCalledWith(expect.stringContaining('Invalid project ID'));
        expect(core.setFailed).toHaveBeenCalledWith('Failed to upload zip: Invalid project ID');
    });

    test('handles missing required input', async () => {
        core.getInput.mockImplementation((name, options) => {
            if (name === 'api_key' && options?.required) {
                throw new Error('Input required and not supplied: api_key');
            }
            return '';
        });

        await run();

        expect(core.setFailed).toHaveBeenCalledWith('Input required and not supplied: api_key');
    });
});