# Lingohub Upload Action

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Available-blue?logo=github)](https://github.com/marketplace/actions/upload-to-lingohub)
[![License](https://img.shields.io/github/license/lingohub/upload-action?style=flat-square)](./LICENSE)

This GitHub Action uploads one or more source content files to your [Lingohub](https://lingohub.com) project for localization.  
It supports glob patterns, multiple files, and is designed for seamless integration into your CI/CD pipelines.

> **Recommended:** Upload only your source files (e.g. English originals).  
> It is possible to upload both source and target files, but we recommend uploading only source files for best results.

## 🚀 Features

- Supports glob patterns and multiple files (order is preserved as specified in the `files` input)
- Uploads all files as a single zip archive to the Lingohub API, preserving original file paths
- Automatic locale detection by Lingohub
- Waits for Lingohub to import the files and fails the step if the import fails
- Uploads to the project's default branch, or to a branch you name
- Built for GitHub CI/CD pipelines

---

## 📦 Inputs

| Name          | Required | Default | Description                                                                                                                           |
|---------------|----------|---------|---------------------------------------------------------------------------------------------------------------------------------------|
| `api_key`     | ✅ Yes   |         | Your Lingohub API key (use [repository secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets))                |
| `project_id`  | ✅ Yes   |         | The Lingohub project ID, e.g. `pr_0197c8f2-5a6b-7cde-8f12-3456789abcde`. Open the project in Lingohub and choose **Copy ID** from its menu. |
| `files`       | ✅ Yes   |         | Paths or glob patterns to the file(s) you want to upload (e.g. `./locales/en.yml,./locales/email/*.yml`). The order of files is preserved. |
| `branch`      | No       | the project's default branch | Name of the Lingohub project branch to upload to                                                                     |
| `wait`        | No       | `true`  | Wait until Lingohub has imported the files. Set it to `false` to finish the step as soon as the upload is accepted.                   |
| `timeout`     | No       | `300`   | Seconds to wait for the import. The import keeps running in Lingohub after a timeout, but the step fails.                             |

## 📤 Outputs

| Name        | Description                                                                                                                     |
|-------------|---------------------------------------------------------------------------------------------------------------------------------|
| `import_id` | ID of the import in Lingohub                                                                                                    |
| `status`    | `SUCCEEDED` or `SKIPPED` after a successful wait; `QUEUED` or `PROCESSING` with `wait: false`. The step fails on `PARTIALLY_SUCCEEDED`, `FAILED` and `CANCELLED`. |

---

## 🛠 Usage

**Basic Example (Automatic Locale Detection)**

```yaml
name: Upload to Lingohub

on:
  push:
    branches: [ main ]

jobs:
  upload:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v5

      - name: Upload to Lingohub
        uses: lingohub/upload-action@v2
        with:
          api_key: ${{ secrets.LINGOHUB_API_KEY }}
          project_id: pr_0197c8f2-5a6b-7cde-8f12-3456789abcde
          files: ./locales/en.yml,./locales/email/*.yml
```

**Upload to a branch, without waiting for the import**

```yaml
      - name: Upload to Lingohub
        uses: lingohub/upload-action@v2
        with:
          api_key: ${{ secrets.LINGOHUB_API_KEY }}
          project_id: pr_0197c8f2-5a6b-7cde-8f12-3456789abcde
          files: ./locales/en.yml
          branch: release-2.4
          wait: false
```

### 📝 Locale Handling
Locale is detected automatically by Lingohub from each file's name and path. No need to specify a locale.

### Source vs. Target Files
Recommended: Upload only your source files (e.g., English originals).
It is possible to upload both source and target files by specifying multiple patterns in the files input. Lingohub will automatically detect the correct locale. However, the order of processing the files is important. For best results and to avoid confusion, upload only source files.

### Import results
When the action waits, the log shows how many texts Lingohub created and updated and how many keys it deactivated, reactivated and renamed. If files fail to import, the log names each one with the reason, and the step fails.

---

## ⬆️ Upgrading from v1

v2 uses version 2 of the Lingohub API.

- **Project ID:** v2 needs the project ID in its new form, `pr_` followed by a UUID. Open the project in Lingohub and choose **Copy ID** from its menu. The old form (`pr_18JCETCbSz7e-40731`) is rejected with a message saying so.
- **API key:** your existing key keeps working.
- **Waiting:** v1 finished as soon as the upload was accepted. v2 waits for the import and fails the step if it fails; set `wait: false` for the old behaviour.

`lingohub/upload-action@v1` stays available for workflows that keep the old project ID.

## 📄 License
Apache-2.0 © lingohub GmbH
