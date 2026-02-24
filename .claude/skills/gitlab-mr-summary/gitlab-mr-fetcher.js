#!/usr/bin/env node
/**
 * gitlab-mr-fetcher.js
 * Fetches GitLab merge request summaries for ska-telescope/sdi group
 * Uses REST API for efficiency (single endpoint for all subprojects)
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Configuration
const GITLAB_API = 'https://gitlab.com/api/v4';
const GROUP_ID = '3180705'; // ska-telescope/sdi
const STATE_DIR = path.join(os.homedir(), '.gitlab-mr-summary');
const CONFIG_FILE = path.join(STATE_DIR, 'config.json');
const STATE_FILE = path.join(STATE_DIR, 'state.json');

/**
 * Load GitLab token from environment or config file
 */
async function loadToken() {
  // Try environment variable first
  if (process.env.GITLAB_TOKEN) {
    return process.env.GITLAB_TOKEN;
  }

  // Try config file
  try {
    const config = JSON.parse(await fs.readFile(CONFIG_FILE, 'utf8'));
    if (config.token) {
      return config.token;
    }
  } catch (err) {
    // Config file doesn't exist or is invalid
  }

  throw new Error(
    'GitLab token not configured.\n' +
    'Set GITLAB_TOKEN environment variable or create ~/.gitlab-mr-summary/config.json:\n' +
    '{\n' +
    '  "token": "glpat-xxxxxxxxxxxxxxxxxxxx"\n' +
    '}'
  );
}

/**
 * Load state (last check timestamp)
 */
async function loadState() {
  try {
    const data = await fs.readFile(STATE_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    // State file doesn't exist, return default (7 days ago)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return {
      lastCheck: sevenDaysAgo.toISOString(),
      lastMRCount: 0
    };
  }
}

/**
 * Save state (current timestamp and MR count)
 */
async function saveState(mrCount) {
  await fs.mkdir(STATE_DIR, { recursive: true });
  const state = {
    lastCheck: new Date().toISOString(),
    lastMRCount: mrCount,
    lastRun: new Date().toISOString()
  };
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

/**
 * Fetch merge requests for the group since a given date
 */
async function fetchGroupMRs(token, sinceDate) {
  const params = new URLSearchParams({
    state: 'merged',
    merged_after: sinceDate.toISOString(),
    order_by: 'merged_at',
    sort: 'desc',
    per_page: '100'
  });

  const url = `${GITLAB_API}/groups/${GROUP_ID}/merge_requests?${params}`;

  const response = await fetch(url, {
    headers: {
      'PRIVATE-TOKEN': token
    }
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('GitLab authentication failed. Check your token.');
    }
    if (response.status === 404) {
      throw new Error('GitLab group not found. Check group ID or permissions.');
    }
    throw new Error(`GitLab API error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Fetch approvals for a specific merge request
 */
async function fetchMRApprovals(token, projectId, mrIid) {
  const url = `${GITLAB_API}/projects/${projectId}/merge_requests/${mrIid}/approvals`;

  try {
    const response = await fetch(url, {
      headers: {
        'PRIVATE-TOKEN': token
      }
    });

    if (!response.ok) {
      // Approvals may not be available (requires Premium/Ultimate)
      return [];
    }

    const data = await response.json();
    return data.approved_by || [];
  } catch (err) {
    // If approvals endpoint fails, return empty array
    return [];
  }
}

/**
 * Enrich MRs with approval data
 */
async function enrichMRsWithApprovals(token, mrs) {
  const enriched = [];

  for (const mr of mrs) {
    const approvals = await fetchMRApprovals(token, mr.project_id, mr.iid);
    enriched.push({
      ...mr,
      approvals
    });
  }

  return enriched;
}

/**
 * Format date for display
 */
function formatDate(isoDate) {
  const date = new Date(isoDate);
  return date.toISOString().replace('T', ' ').split('.')[0] + ' UTC';
}

/**
 * Format date range from MRs
 */
function formatDateRange(mrs, sinceDate) {
  if (mrs.length === 0) {
    return `Since ${formatDate(sinceDate.toISOString())}`;
  }

  const oldestMR = mrs[mrs.length - 1];
  const newestMR = mrs[0];

  const start = new Date(oldestMR.merged_at);
  const end = new Date(newestMR.merged_at);
  const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

  return `${formatDate(start.toISOString())} to ${formatDate(end.toISOString())} (${days} day${days !== 1 ? 's' : ''})`;
}

/**
 * Format MR summary for WhatsApp output
 */
function formatMRSummary(mrs, sinceDate) {
  if (mrs.length === 0) {
    return `*GitLab Merge Requests: ska-telescope/sdi*\n\nNo merge requests merged since ${formatDate(sinceDate.toISOString())}`;
  }

  // Group by project
  const byProject = {};
  for (const mr of mrs) {
    // Extract project name from references.full (e.g., "ska-telescope/sdi/core!123")
    const projectName = mr.references.full.split('!')[0];
    if (!byProject[projectName]) {
      byProject[projectName] = [];
    }
    byProject[projectName].push(mr);
  }

  let output = `*GitLab Merge Requests: ska-telescope/sdi*\n`;
  output += `Period: ${formatDateRange(mrs, sinceDate)}\n\n`;

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
        const desc = mr.description.length > 300
          ? mr.description.substring(0, 300).trim() + '...'
          : mr.description.trim();
        output += `     ${desc}\n\n`;
      }
    }
  }

  output += `---\n`;
  output += `*Summary*: ${mrs.length} merge request${mrs.length !== 1 ? 's' : ''} merged across ${Object.keys(byProject).length} project${Object.keys(byProject).length !== 1 ? 's' : ''}\n`;

  return output;
}

/**
 * Parse date from user input (supports various formats)
 */
function parseUserDate(dateStr) {
  // Handle relative dates
  if (dateStr.match(/last\s+(\d+)\s+day/i)) {
    const days = parseInt(dateStr.match(/(\d+)/)[1]);
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }
  if (dateStr.match(/last\s+week/i)) {
    return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  }
  if (dateStr.match(/last\s+month/i)) {
    return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }

  // Try parsing as ISO date
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  throw new Error(`Could not parse date: ${dateStr}`);
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);

  try {
    // Load token
    const token = await loadToken();

    // Determine date range
    let sinceDate;
    if (args.length > 0 && args[0] !== '--since-last-check') {
      // User provided a date
      sinceDate = parseUserDate(args.join(' '));
    } else {
      // Use last check date from state
      const state = await loadState();
      sinceDate = new Date(state.lastCheck);
    }

    console.error(`Fetching MRs since ${formatDate(sinceDate.toISOString())}...`);

    // Fetch MRs
    const mrs = await fetchGroupMRs(token, sinceDate);
    console.error(`Found ${mrs.length} merge request(s)`);

    // Enrich with approvals
    if (mrs.length > 0) {
      console.error('Fetching approval data...');
      const enrichedMRs = await enrichMRsWithApprovals(token, mrs);

      // Format output
      const summary = formatMRSummary(enrichedMRs, sinceDate);
      console.log(summary);

      // Save state
      await saveState(mrs.length);
    } else {
      const summary = formatMRSummary([], sinceDate);
      console.log(summary);
    }

  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = {
  loadToken,
  loadState,
  saveState,
  fetchGroupMRs,
  fetchMRApprovals,
  enrichMRsWithApprovals,
  formatMRSummary,
  parseUserDate
};
