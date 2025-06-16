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
- Built for GitHub CI/CD pipelines

---

## 📦 Inputs

| Name          | Required | Description                                                                                                                           |
|---------------|----------|---------------------------------------------------------------------------------------------------------------------------------------|
| `api_key`     | ✅ Yes   | Your Lingohub API key (use [repository secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets))                |
| `project_id`  | ✅ Yes   | The Lingohub project ID (e.g., `pr_18JCETCbSz7e-40731`)                                                                              |
| `files`       | ✅ Yes   | Paths or glob patterns to the file(s) you want to upload (e.g. `./locales/en.yml,./locales/email/*.yml`). The order of files is preserved. |

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
        uses: actions/checkout@v3

      - name: Upload to Lingohub
        uses: lingohub/upload-action@v1
        with:
          api_key: ${{ secrets.LINGOHUB_API_KEY }}
          project_id: pr_18JCETCbSz7e-40731
          files: ./locales/en.yml,./locales/email/*.yml
```

### 📝 Locale Handling
Locale is detected automatically by Lingohub. No need to specify a locale.

### Source vs. Target Files
Recommended: Upload only your source files (e.g., English originals).
It is possible to upload both source and target files by specifying multiple patterns in the files input. Lingohub will automatically detect the correct locale. However, the order of processing the files is important. For best results and to avoid confusion, upload only source files.

## 📄 License
Apache-2.0 © lingohub GmbH
