---
name: opengist-publish
description: Publish one or more files as a gist to a self-hosted OpenGist instance and return the public URL. Use whenever a report, document, or set of files needs to be shared via a permanent, linkable URL on OpenGist.
license: MIT
compatibility: Requires Node.js 18+ and git. Needs network access to the OpenGist instance. Tested against OpenGist v1.12.x (no REST API — uses git push over HTTPS).
metadata:
  author: smegol
  version: "2.0"
---

# opengist-publish

Publish files to OpenGist and get back a URL.

## Prerequisites

Three environment variables must be set:

| Variable | Description |
|----------|-------------|
| `OPENGIST_URL` | Base URL, e.g. `https://gist.example.com` |
| `OPENGIST_USER` | OpenGist username |
| `OPENGIST_PASSWORD` | OpenGist account password |

## Usage

Run `scripts/publish.mjs` with the gist inputs as environment variables:

```bash
GIST_TITLE="Weekly Report – 2026-03-29" \
GIST_VISIBILITY="unlisted" \
GIST_FILES='[{"path":"/workspace/group/reports/report.md"},{"path":"/workspace/group/reports/data.csv"}]' \
node scripts/publish.mjs
```

### GIST_FILES format

Pass a JSON array. Each item is one of:

```jsonc
// Read from disk — filename inferred from path
{ "path": "/absolute/path/to/file.md" }

// Inline content
{ "filename": "notes.md", "content": "# Hello\n..." }
```

Mix both forms freely in the same array.

### GIST_VISIBILITY values

| Value | Who can see it |
|-------|---------------|
| `public` | Listed publicly |
| `unlisted` | URL-only access — **default for reports** |
| `private` | Owner only |

Defaults to `unlisted` if not set.

### GIST_TITLE

Human-readable title used to derive the URL slug. Include the date for uniqueness:
`"Monthly Sales Report – March 2026"` → slug `monthly-sales-report-march-2026`

If the slug is already taken, the script automatically appends a Unix timestamp.

## Output

On success, JSON is printed to stdout:

```json
{
  "url": "https://gist.example.com/piers/weekly-report-2026-03-29",
  "slug": "weekly-report-2026-03-29",
  "title": "Weekly Report – 2026-03-29",
  "visibility": "unlisted",
  "files": ["report.md", "data.csv"]
}
```

**Always extract `url` and present it to the user.**

## Full example

```bash
OPENGIST_URL=https://gist.example.com \
OPENGIST_USER=piers \
OPENGIST_PASSWORD=secret \
GIST_TITLE="Q1 Summary" \
GIST_VISIBILITY="unlisted" \
GIST_FILES='[{"filename":"summary.md","content":"# Q1 Summary\n..."},{"filename":"data.csv","content":"month,revenue\nJan,1000"}]' \
node scripts/publish.mjs
```

## Error handling

| Error message | Fix |
|--------------|-----|
| `Missing required env vars` | Set `OPENGIST_URL`, `OPENGIST_USER`, `OPENGIST_PASSWORD` |
| `GIST_FILES is empty` | Provide at least one file in `GIST_FILES` |
| `File not found: /path` | Check the path exists before running |
| `Authentication failed` (git) | Wrong `OPENGIST_PASSWORD` |
| `Login failed — could not load gist edit page` | Credentials invalid or login blocked |
| `Slug already taken` (stderr) | Informational — script appends timestamp automatically |
