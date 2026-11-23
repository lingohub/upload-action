import * as core from '@actions/core';
import * as glob from '@actions/glob';
import {ZipArchive} from 'archiver';
import fs from 'fs';
import path from 'path';
import {PassThrough} from 'stream';
import {
    createClient,
    describeStatusDetails,
    LingohubError,
    parseBoolean,
    parseTimeout,
    requireProjectId,
    resolveBranchId,
    waitForJob
} from './lingohub.js';

const USER_AGENT = 'lingohub-upload-action/2.0.0';
const V1_HINT = ' Workflows that keep the API V1 project ID can stay on lingohub/upload-action@v1.';
const FAILED_STATUSES = ['PARTIALLY_SUCCEEDED', 'FAILED', 'CANCELLED'];

/** `sleep` and `now` exist for tests; the action itself runs with the defaults. */
export async function run({sleep, now} = {}) {
    try {
        const apiKey = core.getInput('api_key', {required: true});
        core.setSecret(apiKey);
        const projectId = requireProjectId(core.getInput('project_id', {required: true}).trim(), V1_HINT);
        const filePatterns = core.getInput('files', {required: true});
        const branchName = core.getInput('branch').trim();
        const wait = parseBoolean(core.getInput('wait'), 'wait', true);
        const timeoutMs = parseTimeout(core.getInput('timeout'));

        core.info(`Starting Lingohub Upload Action with project ID: ${projectId}`);
        core.info(`Using file patterns: ${filePatterns}`);

        const files = await findFiles(filePatterns);
        if (files.length === 0) {
            core.setFailed(`No files found matching pattern: ${filePatterns}`);
            return;
        }
        const zipBuffer = await createZip(files);

        const client = createClient({apiKey, userAgent: USER_AGENT, sleep});
        const branchId = await resolveBranchId(client, projectId, branchName);
        core.info(branchName
            ? `Uploading to branch "${branchName}" (${branchId})`
            : `Uploading to the project's default branch (${branchId})`);

        const formData = new FormData();
        formData.append('file', new Blob([zipBuffer], {type: 'application/zip'}), 'resources.zip');
        const uploadStartTime = Date.now();
        const job = await client.upload(`/branches/${branchId}/imports`, formData);
        const importId = job.data.id;
        core.info(`Uploaded in ${((Date.now() - uploadStartTime) / 1000).toFixed(2)}s; import ${importId} is ${job.data.status}.`);
        core.setOutput('import_id', importId);
        core.setOutput('status', job.data.status);

        if (!wait) {
            core.info('Not waiting for the import to finish (wait: false).');
            return;
        }

        const result = await waitForJob(client, `/imports/${importId}`, {
            label: `Import ${importId}`,
            timeoutMs,
            sleep,
            now,
            onStatus: status => core.info(`Import status: ${status}`)
        });
        core.setOutput('status', result.status);

        if (FAILED_STATUSES.includes(result.status)) {
            await reportFailedEntries(client, importId);
            core.setFailed(`Import ${importId} ended ${result.status} (${describeStatusDetails(result.status_details)}).`);
            return;
        }
        core.info(`Import ${result.status}: ${result.texts_created} texts created, ${result.texts_updated} texts updated, `
            + `${result.keys_deactivated} keys deactivated, ${result.keys_reactivated} keys reactivated, `
            + `${result.keys_renamed} keys renamed.`);
    } catch (error) {
        if (!(error instanceof LingohubError) && error.stack) {
            core.debug(error.stack);
        }
        core.setFailed(error.message);
    }
}

async function findFiles(filePatterns) {
    core.info('Searching for files matching the provided patterns...');
    const patterns = filePatterns.split(',').map(p => p.trim());
    const files = [];
    for (const pattern of patterns) {
        core.info(`Processing pattern: ${pattern}`);
        const globber = await glob.create(pattern);
        const matched = await globber.glob();
        core.info(`Found ${matched.length} files matching pattern: ${pattern}`);

        for (const file of matched) {
            if (!files.includes(file)) {
                files.push(file);
            }
        }
    }
    core.info(`Total unique files found: ${files.length}`);
    return files;
}

async function createZip(files) {
    core.info('Creating zip archive...');
    const archive = new ZipArchive({zlib: {level: 9}});
    const zipStream = new PassThrough();
    const zipChunks = [];

    // Listen before anything is added: the archive reports errors while it reads the files.
    const written = new Promise((resolve, reject) => {
        zipStream.on('data', chunk => zipChunks.push(chunk));
        zipStream.on('end', resolve);
        archive.on('error', reject);
    });
    archive.on('warning', err => core.warning(`Zip warning: ${err.message}`));
    archive.pipe(zipStream);

    for (const file of files) {
        try {
            fs.accessSync(file, fs.constants.R_OK);
            const stats = fs.statSync(file);

            // The path relative to the repository root is the file's path in LingoHub.
            const relativePath = path.relative(process.cwd(), file);
            archive.file(file, {name: relativePath});
            core.info(`Added to zip: ${relativePath} (${formatBytes(stats.size)})`);
        } catch (error) {
            core.warning(`Skipping file ${file}: ${error.message}`);
        }
    }

    core.info('Finalizing zip archive...');
    await Promise.all([archive.finalize(), written]);

    const zipBuffer = Buffer.concat(zipChunks);
    core.info(`Zip archive created successfully: ${formatBytes(zipBuffer.length)}`);
    return zipBuffer;
}

/** Names the files that failed; a failure here must not hide the import's own result. */
async function reportFailedEntries(client, importId) {
    try {
        const filter = JSON.stringify({where: {_and: [{'import_entry[status]': {_eq: 'FAILED'}}]}});
        const entries = await client.get(`/imports/${importId}/entries`, {filter, limit: '100'});
        for (const entry of entries.data || []) {
            core.error(`${entry.file_path} (${entry.language_code}): ${describeStatusDetails(entry.status_details)}`);
        }
        if (entries.has_more) {
            core.error('More files failed; the import\'s entries in LingoHub list all of them.');
        }
    } catch (error) {
        core.warning(`Could not list the files that failed: ${error.message}`);
    }
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
