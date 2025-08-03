# Git Integration for Astro Deployment

This module provides functionality to automatically deploy generated event markdown files to an Astro Git repository and create pull requests on GitHub.

## Setup

### 1. Environment Variables

Create a `.env` file (copy from `.env.example`) with the following variables:

```bash
# GitHub repository URL
ASTRO_REPO_URL=https://github.com/yourusername/your-astro-site.git

# Local path for repository operations
LOCAL_REPO_PATH=/tmp/astro-site

# GitHub personal access token
GITHUB_TOKEN=your_github_token_here
```

### 2. GitHub Token

Create a GitHub personal access token at [https://github.com/settings/tokens](https://github.com/settings/tokens) with the following permissions:

- `repo` (Full control of private repositories)
- If your repository is public, you can use the more limited `public_repo` scope

## Usage

### Command Line

Deploy events for the current month:
```bash
npm run deploy
```

Deploy events for a specific month:
```bash
npm run deploy --month=2025-08
npm run deploy --month=12  # December of current year
```

Specify a custom target file:
```bash
npm run deploy --file=src/content/events/meetups.md
```

### Default File Naming

By default, files are automatically named following this pattern:
```
src/content/post/YYYY-MM-DD-space-coast-tech-events-MONTH-YEAR.mdx
```

Examples:
- `src/content/post/2025-08-03-space-coast-tech-events-august-2025.mdx`
- `src/content/post/2025-08-03-space-coast-tech-events-december-2025.mdx`
- `src/content/post/2025-08-03-space-coast-tech-events-july-2025.mdx`

The date prefix (YYYY-MM-DD) uses the current date when the deployment is run, while the month and year in the filename correspond to the events being processed.

Preview what would be deployed (dry run):
```bash
npm run deploy --dry-run
npm run deploy --month=2025-08 --dry-run
```

### Programmatic Usage

```typescript
import { EventsDeployer } from './src/deployer';
import { createGitHandler } from './src/git-handler';

// Using environment variables
const deployer = new EventsDeployer();

// Deploy current month's events
await deployer.deployEvents();

// Deploy specific month with custom options
await deployer.deployEvents({
  month: '2025-08',
  targetFile: 'src/content/post/custom-events.mdx',
  prTitle: 'Update August 2025 Events',
  branchPrefix: 'events-update'
});

// Or create a custom git handler
const gitHandler = createGitHandler({
  repoUrl: 'https://github.com/user/repo.git',
  repoPath: '/tmp/my-repo',
  githubToken: 'token',
  targetBranch: 'main'
});

const customDeployer = new EventsDeployer(gitHandler);
await customDeployer.deployEvents({ month: '2025-08' });
```

## Workflow

The deployment process follows these steps:

1. **Extract Events**: Scrapes Meetup groups for event data
2. **Filter & Sort**: Filters events by month and sorts chronologically
3. **Generate Markdown**: Creates formatted markdown content
4. **Repository Setup**: Clones or updates the target repository
5. **Branch Management**: Creates or updates branch named after the target month (e.g., `update-events-2025-08`)
6. **File Update**: Writes the markdown content to the specified file
7. **Commit & Push**: Commits changes and pushes to GitHub
8. **Pull Request**: Creates a PR or updates existing one for the same month

### Branch Naming

By default, branches are named using the pattern: `{branchPrefix}-{YYYY-MM}`

Examples:
- `update-events-2025-08` (for August 2025)
- `update-events-2025-12` (for December 2025)
- `events-update-2025-08` (with custom prefix)

If a branch already exists for the same month, the system will:
- Switch to the existing branch
- Update the content with new event data
- Create new commits with the changes
- Update the existing pull request (if one exists)

## Configuration Options

### DeploymentOptions

```typescript
interface DeploymentOptions {
  month?: string;           // 'YYYY-MM' or 'MM' format
  targetFile?: string;      // Path within the repository
  branchPrefix?: string;    // Prefix for branch names
  commitMessage?: string;   // Custom commit message
  prTitle?: string;         // Custom PR title
  prBody?: string;          // Custom PR description
  dryRun?: boolean;         // Preview mode
}
```

### GitConfig

```typescript
interface GitConfig {
  repoUrl: string;          // GitHub repository URL
  repoPath: string;         // Local repository path
  githubToken: string;      // GitHub access token
  targetBranch?: string;    // Target branch (default: 'main')
  prTitle?: string;         // Default PR title
  prBody?: string;          // Default PR description
}
```

## File Structure

- `git-handler.ts` - Core Git operations and GitHub API integration
- `git-config.ts` - Configuration management and defaults
- `deployer.ts` - High-level deployment orchestration
- `.env.example` - Environment variable template

## Error Handling

The system includes comprehensive error handling for:

- Missing environment variables
- Git operation failures
- GitHub API errors
- Network connectivity issues
- Repository access problems

All errors are logged with descriptive messages to help with debugging.

## Security Notes

- Keep your GitHub token secure and never commit it to version control
- Use environment variables or secure secret management
- The token only needs repository access permissions
- Consider using a dedicated bot account for automated deployments
