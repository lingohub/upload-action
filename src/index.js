const core = require('@actions/core');
const glob = require('@actions/glob');
const fs = require('fs');
const fetch = require('node-fetch');
const FormData = require('form-data');
const path = require('path');
const archiver = require('archiver');
const { PassThrough } = require('stream');

async function run() {
    try {
        // Get inputs
        const apiKey = core.getInput('api_key', {required: true});
        const projectId = core.getInput('project_id', {required: true});
        const filePath = core.getInput('files', {required: true});

        core.info(`Starting Lingohub Upload Action with project ID: ${projectId}`);
        core.info(`Using file patterns: ${filePath}`);

        // Find files based on pattern
        core.info('Searching for files matching the provided patterns...');
        const patterns = filePath.split(',').map(p => p.trim());
        let files = [];
        for (const pattern of patterns) {
            core.info(`Processing pattern: ${pattern}`);
            const globber = await glob.create(pattern);
            const matched = await globber.glob();
            core.info(`Found ${matched.length} files matching pattern: ${pattern}`);

            for (const file of matched) {
                // Avoid duplicates
                if (!files.includes(file)) {
                    files.push(file);
                }
            }
        }

        core.info(`Total unique files found: ${files.length}`);
        if (files.length === 0) {
            core.setFailed(`No files found matching pattern: ${filePath}`);
            return;
        }

        // Create a zip archive in memory
        core.info('Creating zip archive...');
        const archive = archiver('zip', { zlib: { level: 9 } });
        const zipStream = new PassThrough();
        const zipChunks = [];

        zipStream.on('data', chunk => {
            zipChunks.push(chunk);
        });

        archive.on('warning', err => core.warning(`Zip warning: ${err.message}`));
        archive.on('error', err => {
            core.error(`Zip error: ${err.message}`);
            throw err;
        });

        archive.pipe(zipStream);

        for (const file of files) {
            try {
                // Check if file exists and is readable
                fs.accessSync(file, fs.constants.R_OK);
                const stats = fs.statSync(file);

                // Add file to archive with its relative path from the repo root
                const relativePath = path.relative(process.cwd(), file);
                archive.file(file, { name: relativePath });
                core.info(`Added to zip: ${relativePath} (${formatBytes(stats.size)})`);
            } catch (error) {
                core.warning(`Skipping file ${file}: ${error.message}`);
            }
        }

        // Wait for the archive to finish and get the buffer
        core.info('Finalizing zip archive...');

        await new Promise((resolve, reject) => {
            archive.on('finish', () => {
                const totalBytes = zipChunks.reduce((a, b) => a + b.length, 0);
                core.info(`Zip archive created successfully: ${formatBytes(totalBytes)}`);
                resolve();
            });
            archive.on('error', err => {
                core.error(`Error finalizing zip: ${err.message}`);
                reject(err);
            });
            archive.finalize();
        });

        const zipBuffer = Buffer.concat(zipChunks);

        // Prepare form data
        core.info('Preparing upload request...');
        const formData = new FormData();
        formData.append('file', zipBuffer, {
            filename: 'resources.zip',
            contentType: 'application/zip'
        });

        // Upload zip to Lingohub
        const apiUrl = `https://api.lingohub.com/v1/projects/${projectId}/resources/zip`;
        core.info(`Uploading zip (${formatBytes(zipBuffer.length)}) to Lingohub API: ${apiUrl}`);

        let uploadStartTime = Date.now();
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json'
            },
            body: formData
        });
        let uploadDuration = Date.now() - uploadStartTime;

        core.info(`Upload completed in ${(uploadDuration/1000).toFixed(2)}s with status: ${response.status} ${response.statusText}`);

        const data = await response.json();
        core.info(`Response data: ${JSON.stringify(data, null, 2)}`);

        if (!response.ok) {
            core.error(`Response status: ${response.status}`);
            core.error(`Response body: ${JSON.stringify(data)}`);
            throw new Error(`Failed to upload zip: ${data.message || response.statusText}`);
        }

        core.info('Successfully uploaded zip with all files.');

    } catch (error) {
        core.error(`Exception: ${error.message}`);
        if (error.stack) {
            core.error(`Stack trace: ${error.stack}`);
        }
        core.setFailed(error.message);
    }
}

// Helper function to format bytes to human-readable format
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

run();
module.exports = { run };
