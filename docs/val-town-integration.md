# Val.town GitHub API Integration

This document provides guidance on using the EvntHndlr tool on Val.town, which requires API-only operations without local file system access.

## Overview

Val.town is a serverless platform that doesn't provide access to:
- Local file system operations
- Git binary/command line tools
- Child process execution (execSync)

This implementation provides a GitHub API-only solution that works within these constraints.

## Quick Start

### 1. Basic Val.town Setup

```typescript
import { EventsDeployer } from "https://esm.town/v/yourusername/evnt-hndlr";

// Configure for Val.town deployment
const deployer = EventsDeployer.forValTown({
  githubToken: process.env.GITHUB_TOKEN, // Set in Val.town secrets
  repoUrl: "https://github.com/yourusername/your-astro-site.git",
  targetBranch: "main",
  prTitle: "Update Space Coast Tech Events"
});

// Deploy current month's events
await deployer.deployEvents();

// Deploy specific month
await deployer.deployEvents({ 
  month: "2025-08",
  targetFile: "src/content/post/august-2025-events.mdx"
});
```

### 2. Manual API Handler Usage

```typescript
import { 
  GitHubApiHandler, 
  createValTownConfig 
} from "https://esm.town/v/yourusername/evnt-hndlr";

const config = createValTownConfig({
  githubToken: process.env.GITHUB_TOKEN,
  repoUrl: "https://github.com/yourusername/your-repo.git"
});

const handler = new GitHubApiHandler(config);

// Validate access
await handler.validateRepository();

// Deploy markdown content
const result = await handler.deployMarkdown(
  markdownContent,
  "src/content/post/events.mdx",
  {
    branchName: "update-events-2025-08",
    commitMessage: "Update August 2025 events",
    prTitle: "August 2025 Events Update"
  }
);

console.log(`PR created: ${result.url}`);
```

## Configuration

### Required Secrets in Val.town

Set these in your Val.town environment secrets:

```bash
GITHUB_TOKEN=your_github_personal_access_token
```

### GitHub Token Permissions

Your GitHub token needs the following permissions:
- `repo` (for private repositories)
- `public_repo` (for public repositories)
- `pull_requests:write`
- `contents:write`

Create a token at: https://github.com/settings/tokens

### Repository Configuration

```typescript
interface ValTownConfig {
  githubToken: string;          // Required: GitHub personal access token
  repoUrl: string;             // Required: Repository URL
  targetBranch?: string;       // Optional: Target branch (default: 'main')
  prTitle?: string;            // Optional: Default PR title
  prBody?: string;             // Optional: Default PR description
}
```

## API Operations

### File Operations

The GitHub API handler uses these endpoints:

1. **Repository Access**: `GET /repos/{owner}/{repo}`
2. **File Content**: `GET /repos/{owner}/{repo}/contents/{path}`
3. **Update File**: `PUT /repos/{owner}/{repo}/contents/{path}`
4. **Branch Management**: `GET/POST/PATCH /repos/{owner}/{repo}/git/refs`
5. **Pull Requests**: `GET/POST /repos/{owner}/{repo}/pulls`

### Advanced Operations (Git Data API)

For multiple file commits:

```typescript
// Create multiple files in a single commit
await handler.createCommitWithFiles([
  { path: "src/content/events.mdx", content: eventsMarkdown },
  { path: "src/data/events.json", content: eventsJson }
], "Update events data", "feature-branch");
```

## Error Handling

### Common Issues and Solutions

1. **Rate Limiting**
   ```typescript
   // The handler automatically includes proper headers
   // GitHub API allows 5000 requests/hour for authenticated users
   ```

2. **Large File Handling**
   ```typescript
   // Files > 1MB require Git Data API (automatically handled)
   // Base64 encoding is handled automatically
   ```

3. **Branch Conflicts**
   ```typescript
   // Check for existing PRs before creating new ones
   const existingPr = await handler.checkExistingPullRequest(branchName);
   if (existingPr) {
     console.log(`PR already exists: ${existingPr.url}`);
   }
   ```

### Error Debugging

```typescript
try {
  await deployer.deployEvents();
} catch (error) {
  console.error("Deployment failed:", error.message);
  
  // Check specific error types
  if (error.message.includes("404")) {
    console.error("Repository not found or no access");
  } else if (error.message.includes("403")) {
    console.error("Insufficient permissions");
  } else if (error.message.includes("422")) {
    console.error("Invalid request - check file paths and content");
  }
}
```

## Val.town Specific Examples

### 1. Scheduled Event Updates

```typescript
// Run weekly on Sundays at 6 AM EST
export default async function weeklyEventUpdate() {
  try {
    const deployer = EventsDeployer.forValTown({
      githubToken: process.env.GITHUB_TOKEN,
      repoUrl: "https://github.com/SpaceCoastDevs/spacecoastdevs.github.io.git"
    });

    await deployer.deployEvents({
      month: new Date().toISOString().slice(0, 7), // Current month YYYY-MM
      prTitle: `Weekly Event Update - ${new Date().toISOString().slice(0, 10)}`
    });

    return { success: true, message: "Events updated successfully" };
  } catch (error) {
    console.error("Failed to update events:", error);
    return { success: false, error: error.message };
  }
}
```

### 2. API Endpoint for Manual Triggers

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { month, targetFile } = await req.json();

    const deployer = EventsDeployer.forValTown({
      githubToken: process.env.GITHUB_TOKEN,
      repoUrl: process.env.REPO_URL
    });

    const result = await deployer.deployEvents({
      month,
      targetFile,
      dryRun: false
    });

    return new Response(JSON.stringify({
      success: true,
      message: "Events deployed successfully"
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
```

### 3. Integration with External Triggers

```typescript
// Webhook handler for external events
export default async function handleWebhook(req) {
  const { source, trigger, data } = await req.json();

  if (source === "meetup" && trigger === "event_updated") {
    const deployer = EventsDeployer.forValTown({
      githubToken: process.env.GITHUB_TOKEN,
      repoUrl: process.env.REPO_URL
    });

    await deployer.deployEvents({
      month: data.eventMonth,
      commitMessage: `Update events - triggered by ${source} ${trigger}`,
      prTitle: `Automated Event Update - ${data.eventMonth}`
    });
  }

  return new Response("OK");
}
```

## Testing

### Test GitHub API Access

```typescript
import { testGitHubApiAccess } from "https://esm.town/v/yourusername/evnt-hndlr";

// Test your token and repository access
try {
  await testGitHubApiAccess(
    process.env.GITHUB_TOKEN,
    "https://github.com/yourusername/your-repo.git"
  );
  console.log("✅ GitHub API access successful");
} catch (error) {
  console.error("❌ GitHub API access failed:", error.message);
}
```

### Dry Run Testing

```typescript
// Test without making actual changes
await deployer.deployEvents({
  month: "2025-08",
  dryRun: true
});
```

## Limitations

1. **No Local Caching**: Each operation hits the GitHub API
2. **Rate Limits**: 5000 requests/hour for authenticated users
3. **File Size Limits**: 100MB per file (handled automatically with Git Data API)
4. **No Git History**: Cannot perform complex git operations like rebasing

## Best Practices

1. **Use Specific Branch Names**: Include timestamps or unique identifiers
2. **Check for Existing PRs**: Avoid creating duplicate pull requests
3. **Handle Rate Limits**: Implement exponential backoff for retries
4. **Validate Content**: Ensure markdown content is valid before deployment
5. **Use Secrets**: Never hardcode tokens in your Val.town code

## Migration from Local Git

To migrate existing code from local git operations:

```typescript
// Old approach (local git)
const deployer = new EventsDeployer();

// New approach (API-only for Val.town)
const deployer = EventsDeployer.forValTown({
  githubToken: process.env.GITHUB_TOKEN,
  repoUrl: process.env.REPO_URL
});

// Same interface, different implementation
await deployer.deployEvents(options);
```

The API remains the same, only the underlying implementation changes.