import {setTimeout as delay} from 'timers/promises';

export const API_BASE_URL = 'https://api.lingohub.com/v2';
export const POLL_INTERVAL_MS = 2000;

const PROJECT_ID_PATTERN = /^pr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const V1_PROJECT_ID_PATTERN = /^pr_[0-9A-Za-z]+-\d+$/;
const PENDING_STATUSES = ['QUEUED', 'PROCESSING'];
const MAX_RETRIES = 3;
const MAX_RETRY_DELAY_MS = 60000;
const REQUEST_TIMEOUT_MS = 60000;
const UPLOAD_TIMEOUT_MS = 600000;

export class LingohubError extends Error {
    constructor(message, {status, code} = {}) {
        super(message);
        this.name = 'LingohubError';
        this.status = status;
        this.code = code;
    }
}

/**
 * Accepts an API V2 project ID (pr_<uuid>), and explains where to find one when given anything else,
 * in particular an API V1 project ID (pr_<base62>-<number>).
 */
export function requireProjectId(projectId, v1Hint = '') {
    if (PROJECT_ID_PATTERN.test(projectId)) {
        return projectId;
    }
    const copyId = 'Open the project in LingoHub and choose Copy ID from its menu.';
    if (V1_PROJECT_ID_PATTERN.test(projectId)) {
        throw new LingohubError(
            `project_id "${projectId}" is an API V1 project ID. This action uses API V2, whose project IDs look like `
            + `pr_0197c8f2-5a6b-7cde-8f12-3456789abcde. ${copyId}${v1Hint}`);
    }
    throw new LingohubError(
        `project_id "${projectId}" is not a LingoHub project ID such as pr_0197c8f2-5a6b-7cde-8f12-3456789abcde. ${copyId}`);
}

export function parseTimeout(value, inputName = 'timeout') {
    const seconds = Number(value || '300');
    if (!Number.isInteger(seconds) || seconds < 1) {
        throw new LingohubError(`${inputName} must be a whole number of seconds, got "${value}".`);
    }
    return seconds * 1000;
}

export function parseBoolean(value, inputName, defaultValue) {
    const normalized = (value || '').trim().toLowerCase();
    if (normalized === '') {
        return defaultValue;
    }
    if (['true', 'yes', 'on'].includes(normalized)) {
        return true;
    }
    if (['false', 'no', 'off'].includes(normalized)) {
        return false;
    }
    throw new LingohubError(`${inputName} must be true or false, got "${value}".`);
}

/**
 * A small API V2 client. Every request carries the API key; it never follows redirects, so the key cannot travel to
 * another host. Reads are retried on network errors, 429 and 502–504; writes only on 429, which the API answers
 * before doing anything.
 */
export function createClient({apiKey, userAgent, baseUrl = API_BASE_URL, sleep = delay}) {
    async function request(method, path, {query, json, form, timeoutMs = REQUEST_TIMEOUT_MS} = {}) {
        const url = new URL(`${baseUrl}${path}`);
        for (const [name, value] of Object.entries(query || {})) {
            url.searchParams.set(name, value);
        }
        const headers = {'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json', 'User-Agent': userAgent};
        let body;
        if (json !== undefined) {
            headers['Content-Type'] = 'application/json';
            body = JSON.stringify(json);
        } else if (form) {
            body = form;
        }
        const isRead = method === 'GET';

        for (let attempt = 0; ; attempt++) {
            let response;
            try {
                response = await fetch(url, {method, headers, body, redirect: 'error', signal: AbortSignal.timeout(timeoutMs)});
            } catch (error) {
                if (isRead && attempt < MAX_RETRIES) {
                    await sleep(backoff(attempt));
                    continue;
                }
                throw new LingohubError(`${method} ${path} failed: ${error.cause?.message || error.message}`);
            }

            const retryable = response.status === 429 || (isRead && response.status >= 502 && response.status <= 504);
            if (retryable && attempt < MAX_RETRIES) {
                await response.body?.cancel();
                await sleep(retryDelay(response, attempt));
                continue;
            }

            const text = await response.text();
            if (!response.ok) {
                const problem = parseJson(text) || {detail: text.slice(0, 500)};
                throw new LingohubError(problemMessage(method, path, response.status, problem),
                    {status: response.status, code: problem.code});
            }
            const data = parseJson(text);
            if (data === undefined) {
                throw new LingohubError(`${method} ${path} answered HTTP ${response.status} without a JSON body.`);
            }
            return data;
        }
    }

    return {
        get: (path, query) => request('GET', path, {query}),
        post: (path, json) => request('POST', path, {json}),
        upload: (path, form) => request('POST', path, {form, timeoutMs: UPLOAD_TIMEOUT_MS})
    };
}

function backoff(attempt) {
    return Math.min(1000 * 2 ** attempt, MAX_RETRY_DELAY_MS);
}

function retryDelay(response, attempt) {
    const retryAfter = response.headers.get('Retry-After');
    if (retryAfter) {
        const seconds = Number(retryAfter);
        const milliseconds = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now();
        if (Number.isFinite(milliseconds)) {
            return Math.min(Math.max(milliseconds, 1000), MAX_RETRY_DELAY_MS);
        }
    }
    return backoff(attempt);
}

function parseJson(text) {
    if (!text) {
        return undefined;
    }
    try {
        return JSON.parse(text);
    } catch {
        return undefined;
    }
}

function problemMessage(method, path, status, problem) {
    let message = `${method} ${path} failed with HTTP ${status}`;
    const summary = problem.detail || problem.title;
    if (summary) {
        message += `: ${summary}`;
    }
    const references = [problem.code && `code ${problem.code}`, problem.request_id && `request ${problem.request_id}`]
        .filter(Boolean);
    if (references.length > 0) {
        message += ` (${references.join(', ')})`;
    }
    for (const error of problem.errors || []) {
        const field = error.pointer || error.parameter;
        message += `\n  - ${field ? `${field}: ` : ''}${error.detail}`;
    }
    if (status === 401) {
        message += '\nCheck that api_key holds a valid LingoHub API key.';
    }
    return message;
}

/** The branch with this name, or the project's default branch when no name is given. */
export async function resolveBranchId(client, projectId, branchName) {
    if (!branchName) {
        const project = await client.get(`/projects/${projectId}`);
        if (!project.default_branch_id) {
            throw new LingohubError(`Project ${projectId} has no default branch yet; it is still being created.`);
        }
        return project.default_branch_id;
    }
    const filter = JSON.stringify({where: {_and: [{'branch[name]': {_eq: branchName}}]}});
    const branches = await client.get(`/projects/${projectId}/branches`, {filter, limit: '1'});
    const branch = branches.data?.[0];
    if (!branch) {
        throw new LingohubError(`Project ${projectId} has no branch named "${branchName}".`);
    }
    return branch.id;
}

/** Reads the job at `path` until it leaves QUEUED and PROCESSING, and returns it. */
export async function waitForJob(client, path, {label, timeoutMs, onStatus = () => {}, sleep = delay, now = Date.now}) {
    const deadline = now() + timeoutMs;
    let lastStatus;
    for (;;) {
        const job = await client.get(path);
        if (job.status !== lastStatus) {
            onStatus(job.status);
            lastStatus = job.status;
        }
        if (!PENDING_STATUSES.includes(job.status)) {
            return job;
        }
        if (now() + POLL_INTERVAL_MS > deadline) {
            throw new LingohubError(`${label} is still ${job.status} after ${Math.round(timeoutMs / 1000)} s. `
                + 'It keeps running in LingoHub; raise timeout to wait longer.');
        }
        await sleep(POLL_INTERVAL_MS);
    }
}

export function describeStatusDetails(details) {
    return details ? `${details.code}: ${details.detail}` : 'no details given';
}
