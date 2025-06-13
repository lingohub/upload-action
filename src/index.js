const core = require('@actions/core');
const glob = require('@actions/glob');
const fs = require('fs');
const fetch = require('node-fetch');
const FormData = require('form-data');
const path = require('path');

async function run() {
    try {
        // Get inputs
        const apiKey = core.getInput('api_key', {required: true});
        const workspaceUrl = core.getInput('workspace_url', {required: true});
        const projectUrl = core.getInput('project_url', {required: true});
        const filePath = core.getInput('files', {required: true});
        const localeOption = core.getInput('locale', {required: false}) || 'auto';

        core.info(`Using locale option: ${localeOption}`);

        // Find files based on pattern
        const globber = await glob.create(filePath);
        const files = await globber.glob();

        if (files.length === 0) {
            core.setFailed(`No files found matching pattern: ${filePath}`);
            return;
        }

        // Upload each file
        for (const file of files) {
            core.info(`Uploading ${file}...`);

            const formData = new FormData();
            formData.append('file', fs.createReadStream(file));

            // Handle locale based on option
            if (localeOption !== 'auto') {
                formData.append('locale', localeOption);
                core.info(`Using specified locale: ${localeOption}`);
            } else {
                core.info('Using automatic locale detection');
            }

            // Use projectUrl as required by the new API
            const response = await fetch(`https://api.lingohub.com/v1/${workspaceUrl}/projects/${projectUrl}/resources`, {
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
                throw new Error(`Failed to upload ${file}: ${data.message || response.statusText}`);
            }

            core.info(`Successfully uploaded ${file}`);
        }

    } catch (error) {
        core.setFailed(error.message);
    }
}

run();
module.exports = { run };