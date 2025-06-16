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

        // Find files based on pattern
        const patterns = filePath.split(',').map(p => p.trim());
        let files = [];
        for (const pattern of patterns) {
            const globber = await glob.create(pattern);
            const matched = await globber.glob();
            for (const file of matched) {
                // Avoid duplicates
                if (!files.includes(file)) {
                    files.push(file);
                }
            }
        }

        if (files.length === 0) {
            core.setFailed(`No files found matching pattern: ${filePath}`);
            return;
        }

        // Create a zip archive in memory
        const archive = archiver('zip', { zlib: { level: 9 } });
        const zipStream = new PassThrough();
        const zipChunks = [];
        zipStream.on('data', chunk => zipChunks.push(chunk));
        archive.on('warning', err => core.warning(err.message));
        archive.on('error', err => { throw err; });
        archive.pipe(zipStream);

        for (const file of files) {
            // Add file to archive with its relative path from the repo root
            const relativePath = path.relative(process.cwd(), file);
            archive.file(file, { name: relativePath });
            core.info(`Added to zip: ${relativePath}`);
        }

        // Wait for the archive to finish and get the buffer
        await new Promise((resolve, reject) => {
            archive.on('finish', resolve);
            archive.on('error', reject);
            archive.finalize();
        });
        const zipBuffer = Buffer.concat(zipChunks);

        // Prepare form data
        const formData = new FormData();
        formData.append('file', zipBuffer, {
            filename: 'resources.zip',
            contentType: 'application/zip'
        });

        // Upload zip to Lingohub
        core.info('Uploading zip to Lingohub...');
        const response = await fetch(`https://api.lingohub.com/v1/projects/${projectId}/resources/zip`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json'
            },
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            core.error(`Response status: ${response.status}`);
            core.error(`Response body: ${JSON.stringify(data)}`);
            throw new Error(`Failed to upload zip: ${data.message || response.statusText}`);
        }

        core.info('Successfully uploaded zip with all files.');

    } catch (error) {
        core.setFailed(error.message);
    }
}

run();
module.exports = { run };