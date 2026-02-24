---
name: gitlab-mr-summary
description: >
  Reports GitLab merge request summaries for ska-telescope/sdi group.
  Shows MR title, description, merge time, author, approvals, and link.
  Supports date range filtering and scheduled execution. Uses GitLab REST API
  for efficient querying across all subprojects.
---

# GitLab Merge Request Summary Skill

This skill fetches and reports merged merge requests from the ska-telescope/sdi GitLab group.

## Features

- 📊 Lists all merged MRs from the group and its subprojects
- 📅 Filters by date range (since last check or custom date)
- 👥 Shows author, approvers, and approval status
- 🔗 Provides direct links to each MR
- 📦 Groups results by project
- ⏰ Supports scheduled execution (e.g., daily summaries)

## Usage

### Interactive Usage

**Get MRs since last check**:
```
@smegol show me gitlab merge requests for ska-telescope/sdi since last check
```

**Get MRs from a specific date**:
```
@smegol show me gitlab MRs for ska-telescope/sdi since 2026-02-20
```

**Get MRs for the last 7 days**:
```
@smegol show me gitlab merge requests for ska-telescope/sdi for the last week
```

### Scheduled Usage

Set up a daily summary at 9am:

```javascript
schedule_task(
  prompt: "Run the gitlab-mr-summary skill for ska-telescope/sdi group and send me a summary",
  schedule_type: "cron",
  schedule_value: "0 9 * * *",
  context_mode: "isolated"
)
```

## Prerequisites

### 1. GitLab Personal Access Token

You need a GitLab personal access token with `read_api` scope.

**Create token**:
1. Go to https://gitlab.com/-/user_settings/personal_access_tokens
2. Click "Add new token"
3. Name: "nanoclaw-mr-summary"
4. Expiration: Set as needed
5. Scopes: Check `read_api`
6. Click "Create personal access token"
7. Copy the token (you won't see it again)

### 2. Configure Token

**Option A: Environment variable** (recommended for scheduled jobs):

```bash
export GITLAB_TOKEN="glpat-xxxxxxxxxxxxxxxxxxxx"
```

Add to your shell profile (`.bashrc`, `.zshrc`) to persist:

```bash
echo 'export GITLAB_TOKEN="glpat-xxxxxxxxxxxxxxxxxxxx"' >> ~/.bashrc
```

**Option B: Config file** (alternative):

```bash
mkdir -p ~/.gitlab-mr-summary
cat > ~/.gitlab-mr-summary/config.json <<EOF
{
  "token": "glpat-xxxxxxxxxxxxxxxxxxxx",
  "groupId": "3180705"
}
EOF
chmod 600 ~/.gitlab-mr-summary/config.json
```

### 3. Install Dependencies

The skill uses Node.js with native `fetch` (Node 18+), so no additional dependencies are needed beyond what nanoclaw already has.

## How It Works

### API Strategy

The skill uses GitLab's **REST API** with a per-project query strategy to avoid timeouts on large groups:

**Why per-project instead of group MRs endpoint?**
- ✅ `/groups/:id/merge_requests` times out on large groups (many subprojects)
- ✅ Per-project queries are faster and more reliable
- ✅ Parallel batching (5 projects at a time) keeps total time low
- ✅ Failures on inaccessible projects are non-fatal (skipped gracefully)

**API calls made**:
1. **Paginated calls** to `/groups/:id/projects?include_subgroups=true` to get all projects
2. **One call per project** (batched 5 at a time) to `/projects/:id/merge_requests` with date filter
3. **One call per MR** to `/projects/:id/merge_requests/:iid/approvals` (only for merged MRs)

### State Management

The skill tracks the last check time in `~/.gitlab-mr-summary/state.json`:

```json
{
  "lastCheck": "2026-02-23T12:00:00.000Z",
  "lastMRCount": 5
}
```

When invoked without a date parameter, it uses this timestamp. After successful execution, it updates the state file.

### Output Format

Results are formatted for WhatsApp readability (using *bold* and bullets, not markdown headings):

```
*GitLab Merge Requests: ska-telescope/sdi*
Period: 2026-02-20 to 2026-02-23 (3 days)

*Project: sdi-platform/core*

  ✅ !123: Add authentication layer
     👤 Author: John Smith
     ⏰ Merged: 2026-02-22 14:30 UTC
     ✓ Approved by: Alice Johnson, Bob Chen
     🔗 https://gitlab.com/ska-telescope/sdi/core/-/merge_requests/123

     Implements OAuth2 authentication with JWT tokens for API endpoints.

  ✅ !124: Fix memory leak in worker process
     👤 Author: Alice Johnson
     ⏰ Merged: 2026-02-23 09:15 UTC
     ✓ Approved by: John Smith
     🔗 https://gitlab.com/ska-telescope/sdi/core/-/merge_requests/124

     Fixes a memory leak in the background worker process that was causing
     gradual memory exhaustion over time.

---
*Summary*: 2 merge requests merged across 1 project
```

## Implementation Steps

### Step 1: Check Token Configuration

```javascript
const fs = require('fs').promises;
const os = require('os');
const path = require('path');

const STATE_DIR = path.join(os.homedir(), '.gitlab-mr-summary');
const CONFIG_FILE = path.join(STATE_DIR, 'config.json');
const STATE_FILE = path.join(STATE_DIR, 'state.json');

// Try to load token from environment or config
let gitlabToken = process.env.GITLAB_TOKEN;

if (!gitlabToken) {
  try {
    const config = JSON.parse(await fs.readFile(CONFIG_FILE, 'utf8'));
    gitlabToken = config.token;
  } catch (err) {
    // Config file doesn't exist or is invalid
  }
}

if (!gitlabToken) {
  throw new Error(
    'GitLab token not configured. Set GITLAB_TOKEN environment variable or create ~/.gitlab-mr-summary/config.json'
  );
}
```

### Step 2: Fetch Group Merge Requests

```javascript
const GROUP_ID = '3180705'; // ska-telescope/sdi
const GITLAB_API = 'https://gitlab.com/api/v4';

async function fetchGroupMRs(sinceDate) {
  const params = new URLSearchParams({
    state: 'merged',
    merged_after: sinceDate.toISOString(),
    order_by: 'merged_at',
    sort: 'desc',
    per_page: '100'
  });

  const response = await fetch(
    `${GITLAB_API}/groups/${GROUP_ID}/merge_requests?${params}`,
    {
      headers: {
        'PRIVATE-TOKEN': gitlabToken
      }
    }
  );

  if (!response.ok) {
    throw new Error(`GitLab API error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}
```

### Step 3: Fetch Approvals for Each MR

```javascript
async function fetchMRApprovals(projectId, mrIid) {
  const response = await fetch(
    `${GITLAB_API}/projects/${projectId}/merge_requests/${mrIid}/approvals`,
    {
      headers: {
        'PRIVATE-TOKEN': gitlabToken
      }
    }
  );

  if (!response.ok) {
    // If approvals endpoint fails, return empty array
    return [];
  }

  const data = await response.json();
  return data.approved_by || [];
}
```

### Step 4: Format Output

```javascript
function formatMRSummary(mrs) {
  // Group by project
  const byProject = {};
  for (const mr of mrs) {
    const projectName = mr.references.full.split('!')[0];
    if (!byProject[projectName]) {
      byProject[projectName] = [];
    }
    byProject[projectName].push(mr);
  }

  let output = `*GitLab Merge Requests: ska-telescope/sdi*\n`;
  output += `Period: ${formatDateRange(mrs)}\n\n`;

  for (const [project, projectMRs] of Object.entries(byProject)) {
    output += `*Project: ${project}*\n\n`;

    for (const mr of projectMRs) {
      output += `  ✅ !${mr.iid}: ${mr.title}\n`;
      output += `     👤 Author: ${mr.author.name}\n`;
      output += `     ⏰ Merged: ${formatDate(mr.merged_at)}\n`;

      if (mr.approvals && mr.approvals.length > 0) {
        const approvers = mr.approvals.map(a => a.user.name).join(', ');
        output += `     ✓ Approved by: ${approvers}\n`;
      } else {
        output += `     ✓ No approvals\n`;
      }

      output += `     🔗 ${mr.web_url}\n\n`;

      if (mr.description && mr.description.trim()) {
        // Truncate long descriptions
        const desc = mr.description.length > 200
          ? mr.description.substring(0, 200) + '...'
          : mr.description;
        output += `     ${desc}\n\n`;
      }
    }
  }

  output += `---\n`;
  output += `*Summary*: ${mrs.length} merge request(s) merged across ${Object.keys(byProject).length} project(s)\n`;

  return output;
}
```

### Step 5: State Management

```javascript
async function loadState() {
  try {
    const data = await fs.readFile(STATE_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    // State file doesn't exist, return default
    return {
      lastCheck: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
      lastMRCount: 0
    };
  }
}

async function saveState(mrCount) {
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(
    STATE_FILE,
    JSON.stringify({
      lastCheck: new Date().toISOString(),
      lastMRCount: mrCount
    }, null, 2),
    'utf8'
  );
}
```

## Error Handling

The skill handles common errors gracefully:

- **Missing token**: Clear error message with setup instructions
- **API rate limits**: Retry with exponential backoff
- **Network errors**: Report error without crashing
- **Invalid dates**: Fall back to "last 7 days"
- **Missing approvals**: Show "No approvals" instead of failing

## Testing

See `../tests/test-gitlab-api.js` for API connectivity tests.

Run test:
```bash
GITLAB_TOKEN="your-token" node tests/test-gitlab-api.js
```

## Scheduling Example

Daily summary at 9am:

```javascript
schedule_task(
  prompt: "Show me merged GitLab MRs for ska-telescope/sdi since last check",
  schedule_type: "cron",
  schedule_value: "0 9 * * *",
  context_mode: "isolated"
)
```

Weekly summary every Monday at 9am:

```javascript
schedule_task(
  prompt: "Show me merged GitLab MRs for ska-telescope/sdi for the last week",
  schedule_type: "cron",
  schedule_value: "0 9 * * 1",
  context_mode: "isolated"
)
```

## Rate Limits

GitLab.com rate limits:
- 2000 requests/minute for authenticated users
- Group MRs endpoint: 1 request (all subprojects)
- Approvals endpoint: 1 request per MR

With `per_page=100`, the skill makes:
- 1 API call for up to 100 MRs
- N API calls for approvals (where N = number of MRs)

For typical usage (10-20 MRs per day), this is well within limits.

## Troubleshooting

**Error: "GitLab token not configured"**
→ Set `GITLAB_TOKEN` environment variable or create config file

**Error: "401 Unauthorized"**
→ Token is invalid or expired; regenerate token

**Error: "403 Forbidden"**
→ Token lacks `read_api` scope; create new token with correct scope

**Error: "404 Not Found" for group**
→ Group ID is incorrect or you don't have access

**No results returned**
→ Check date range; may be no MRs in that period

## References

- [GitLab Merge Requests API](https://docs.gitlab.com/api/merge_requests/)
- [GitLab Groups API](https://docs.gitlab.com/api/groups/)
- [GitLab Merge Request Approvals API](https://docs.gitlab.com/api/merge_request_approvals/)
- [GitLab REST API Pagination](https://docs.gitlab.com/api/rest/)
