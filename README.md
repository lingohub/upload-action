# Lingohub Upload Action

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Available-blue?logo=github)](https://github.com/marketplace/actions/upload-to-lingohub)
[![License](https://img.shields.io/github/license/lingohub/upload-action?style=flat-square)](./LICENSE)

This GitHub Action uploads one or more source files to your [Lingohub](https://lingohub.com) project for localization.

## 🚀 Features

- Supports glob patterns to upload multiple files
- Streams files directly to the Lingohub API
- Optional locale configuration
- Built for GitHub CI/CD pipelines

---

## 📦 Inputs

| Name         | Required | Description                                                                                                            |
|--------------|----------|------------------------------------------------------------------------------------------------------------------------|
| `api_key`    | ✅ Yes   | Your Lingohub API key (use [repository secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)) |
| `project_id` | ✅ Yes   | The ID of your Lingohub project                                                                                        |
| `files`      | ✅ Yes   | Path or glob pattern to the file(s) you want to upload (e.g. `./locales/*.json`)                                       |
| `locale`     | ❌ No    | Locale option for the files. Use auto (default) for automatic detection or specify a locale (e.g. en)                  |

---

## 🛠 Usage

Basic Example (with Automatic Locale Detection)

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
          project_id: your-project-id
          files: ./locales/*.json
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
          project_id: your-project-id
          files: ./locales/en/*.json
          locale: en
```

### 📝 Locale Handling
* Use `locale: auto` (default) to let Lingohub automatically detect the locale from your files
* Use a specific language code (e.g., `en`, `de`, `fr`) to explicitly set the locale for all uploaded files
