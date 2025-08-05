# EvntHndlr - GitHub API Integration Examples

This document provides practical examples for using EvntHndlr with GitHub API-only mode, perfect for Val.town and serverless environments.

## Quick Start Examples

### 1. Val.town Deployment

```typescript
import { EventsDeployer } from "https://esm.town/v/yourusername/evnt-hndlr";

// Simple Val.town deployment
export default async function updateEvents() {
  const deployer = EventsDeployer.forValTown({
    githubToken: process.env.GITHUB_TOKEN,
    repoUrl: "https://github.com/SpaceCoastDevs/spacecoastdevs.github.io.git"
  });

  await deployer.deployEvents();
  
  return { success: true, message: "Events updated!" };
}
```

### 2. Serverless Function (Vercel/Netlify)

```typescript
import { createValTownDeployer } from './src/index';

export default async function handler(req, res) {
  try {
    const deployer = createValTownDeployer({
      githubToken: process.env.GITHUB_TOKEN,
      repoUrl: process.env.REPO_URL
    });

    await deployer.deployEvents({
      month: req.query.month,
      dryRun: req.query.dryRun === 'true'
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
```

### 3. Browser Environment

```typescript
// Works in browser environments without Node.js dependencies
import { GitHubApiHandler, createValTownConfig } from './dist/index.js';

const config = createValTownConfig({
  githubToken: 'your-token',
  repoUrl: 'https://github.com/user/repo.git'
});

const handler = new GitHubApiHandler(config);

// Deploy markdown content
await handler.deployMarkdown(
  markdownContent,
  'src/content/post/events.mdx',
  {
    branchName: 'update-events-2025-08',
    commitMessage: 'Update events',
    prTitle: 'Monthly Events Update'
  }
);
```

## Advanced Usage

### Multiple File Deployment

```typescript
const handler = new GitHubApiHandler(config);

// Deploy multiple files in a single commit
await handler.createCommitWithFiles([
  { 
    path: 'src/content/post/events.mdx', 
    content: eventsMarkdown 
  },
  { 
    path: 'src/data/events.json', 
    content: JSON.stringify(eventsData, null, 2) 
  }
], 'Update events data and markdown', 'feature-branch');
```

### Custom Branch and PR Management

```typescript
const deployer = EventsDeployer.forValTown(config);

await deployer.deployEvents({
  month: '2025-08',
  targetFile: 'content/events/august-2025.md',
  branchPrefix: 'events-update',
  commitMessage: 'Add August 2025 events',
  prTitle: 'August 2025 Events Update',
  prBody: 'Automated update with latest meetup events'
});
```

### Error Handling and Retry Logic

```typescript
async function deployWithRetry(maxRetries = 3) {
  const deployer = EventsDeployer.forValTown(config);
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await deployer.deployEvents();
      console.log('✅ Deployment successful');
      return;
    } catch (error) {
      console.log(`❌ Attempt ${attempt} failed: ${error.message}`);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
}
```

## Environment-Specific Configurations

### Val.town Secrets

```bash
# Set these in your Val.town secrets
GITHUB_TOKEN=ghp_your_token_here
```

### Local Development

```bash
# .env file for local development
ASTRO_REPO_URL=https://github.com/yourusername/your-repo.git
LOCAL_REPO_PATH=/tmp/astro-site
GITHUB_TOKEN=your_github_token
```

### CI/CD (GitHub Actions)

```yaml
name: Update Events
on:
  schedule:
    - cron: '0 6 * * 0'  # Weekly on Sunday at 6 AM

jobs:
  update-events:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run deploy -- --api-only --month=$(date +%Y-%m)
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          ASTRO_REPO_URL: ${{ github.repository }}
```

## Testing and Debugging

### Test GitHub API Access

```typescript
import { testGitHubApiAccess } from './src/index';

// Verify your token and repository access
await testGitHubApiAccess(
  process.env.GITHUB_TOKEN,
  'https://github.com/user/repo.git'
);
```

### Dry Run Mode

```typescript
// Preview what would be deployed
await deployer.deployEvents({
  month: '2025-08',
  dryRun: true
});
```

### Debug Mode

```typescript
// Log detailed API requests
const handler = new GitHubApiHandler(config);

// All API calls are logged to console
await handler.validateRepository();
await handler.deployMarkdown(content, path, options);
```

## Migration from Local Git

### Before (Local Git Mode)

```typescript
// Requires file system and git binary
const deployer = new EventsDeployer();
await deployer.deployEvents();
```

### After (API-Only Mode)

```typescript
// Works anywhere with network access
const deployer = EventsDeployer.forValTown({
  githubToken: process.env.GITHUB_TOKEN,
  repoUrl: process.env.REPO_URL
});
await deployer.deployEvents();
```

## Performance Considerations

### Rate Limiting

```typescript
// GitHub allows 5000 requests/hour for authenticated users
// Each deployment typically uses 5-10 API calls

const handler = new GitHubApiHandler(config);

// Check rate limit status
const rateLimit = await fetch('https://api.github.com/rate_limit', {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

### Caching Strategies

```typescript
// Cache repository info to reduce API calls
let repoCache = null;

async function getCachedRepoInfo() {
  if (!repoCache) {
    await handler.validateRepository();
    repoCache = { validated: true, timestamp: Date.now() };
  }
  return repoCache;
}
```

## Common Patterns

### Scheduled Updates

```typescript
// Run every Sunday at 6 AM EST
export default async function weeklyUpdate() {
  const deployer = EventsDeployer.forValTown(config);
  
  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7);
  
  await deployer.deployEvents({
    month: currentMonth,
    prTitle: `Weekly Events Update - ${currentMonth}`
  });
}
```

### Webhook Integration

```typescript
// Handle external webhook triggers
export default async function handleWebhook(req) {
  const { eventType, data } = await req.json();
  
  if (eventType === 'meetup.event.updated') {
    const deployer = EventsDeployer.forValTown(config);
    
    await deployer.deployEvents({
      month: data.eventMonth,
      commitMessage: `Update events - ${eventType}`,
      prTitle: `Automated Update - ${data.eventMonth}`
    });
  }
  
  return new Response('OK');
}
```

### API Gateway Integration

```typescript
// AWS Lambda or similar
exports.handler = async (event) => {
  const deployer = createValTownDeployer({
    githubToken: process.env.GITHUB_TOKEN,
    repoUrl: process.env.REPO_URL
  });

  const { month, targetFile } = JSON.parse(event.body);

  await deployer.deployEvents({ month, targetFile });

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Events updated successfully' })
  };
};
```