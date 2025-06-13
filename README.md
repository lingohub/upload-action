# Lingohub Upload Action

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Available-blue?logo=github)](https://github.com/marketplace/actions/upload-to-lingohub)
[![License](https://img.shields.io/github/license/lingohub/upload-action?style=flat-square)](./LICENSE)

This GitHub Action uploads one or more source content files to your [Lingohub](https://lingohub.com) project for localization.  
It supports glob patterns, multiple files, and is designed for seamless integration into your CI/CD pipelines.

> **Recommended:** Upload only your source files (e.g. English originals).  
> It is possible to upload both source and target files, but we recommend uploading only source files for best results.

## 🚀 Features

- Supports glob patterns and multiple files (order is preserved as specified in the `files` input)
- Streams files directly to the Lingohub API
- Optional locale configuration (`auto` or explicit locale)
- Built for GitHub CI/CD pipelines

---

## 📦 Inputs

| Name            | Required | Description                                                                                                                                                |
|-----------------|----------|------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `api_key`       | ✅ Yes   | Your Lingohub API key (use [repository secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets))                                     |
| `workspace_url` | ✅ Yes   | The URL of your Lingohub workspace (e.g., https://app.lingohub.com/your-workspace)                                                                         |
| `project_url`   | ✅ Yes   | The URL of your Lingohub project (e.g., https://app.lingohub.com/your-workspace/your-project)                                                              |
| `files`         | ✅ Yes   | Paths or glob patterns to the file(s) you want to upload (e.g. `./locales/en.yml,./locales/email/*.yml`). The order of files is preserved.                 |
| `locale`        | ❌ No    | Locale option for the files. Use `auto` (default) for automatic detection or specify a locale (e.g. `en`). The specified locale is used for *all* files.    |

---

## 🛠 Usage

**Basic Example (with Automatic Locale Detection)**

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
        uses: actions/checkout@v3

      - name: Upload to Lingohub
        uses: lingohub/upload-action@v1
        with:
          api_key: ${{ secrets.LINGOHUB_API_KEY }}
          workspace_url: https://app.lingohub.com/your-workspace
          project_url: https://app.lingohub.com/your-workspace/your-project
          files: ./locales/en.yml,./locales/email/*.yml
```

Specifying a Locale

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
        uses: actions/checkout@v3

      - name: Upload English Source Files
        uses: lingohub/upload-action@v1
        with:
          api_key: ${{ secrets.LINGOHUB_API_KEY }}
          workspace_url: https://app.lingohub.com/your-workspace
          project_url: https://app.lingohub.com/your-workspace/your-project
          files: ./locales/en/*.json
          locale: en
```

### 📝 Locale Handling
Use locale: auto (default) to let Lingohub automatically detect the locale from your files.
Use a specific language code (e.g., en, de, fr) to explicitly set the locale for *all uploaded files*.

### Source vs. Target Files
Recommended: Upload only your source files (e.g., English originals).
It is possible to upload both source and target files by specifying multiple patterns in the files input. Lingohub will automatically detect the correct locale. However, the order of processing the files is important. For best results and to avoid confusion, upload only source files.

## 📄 License
Apache-2.0 © lingohub GmbH