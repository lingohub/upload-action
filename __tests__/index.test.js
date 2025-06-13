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
    createReadStream: jest.fn().mockReturnValue('file-stream')
}));

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
                    return 'test-project-id';
                case 'files':
                    return '*.json';
                case 'locale':
                    return 'auto';
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

    test('successfully uploads files with automatic locale detection', async () => {
        await run();

        expect(core.getInput).toHaveBeenCalledWith('locale', {required: false});
        expect(core.info).toHaveBeenCalledWith('Using locale option: auto');
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(core.info).toHaveBeenCalledWith('Successfully uploaded test1.json');
        expect(core.info).toHaveBeenCalledWith('Successfully uploaded test2.json');
        expect(core.setFailed).not.toHaveBeenCalled();
    });

    test('successfully uploads files with specified locale', async () => {
        core.getInput.mockImplementation((name) => {
            if (name === 'locale') return 'en';
            return name === 'api_key' ? 'test-api-key' :
                name === 'project_id' ? 'test-project-id' :
                    name === 'files' ? '*.json' : '';
        });

        await run();

        // Instead of expecting a specific call order, check if the call was made
        expect(core.getInput).toHaveBeenCalledWith('locale', {required: false});
        expect(core.info).toHaveBeenCalledWith('Using locale option: en');
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(core.info).toHaveBeenCalledWith('Successfully uploaded test1.json');
        expect(core.info).toHaveBeenCalledWith('Successfully uploaded test2.json');
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
        expect(core.setFailed).toHaveBeenCalledWith('Failed to upload test1.json: Invalid project ID');
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