# EvntHndlr 🚀

A TypeScript tool for extracting, formatting, and deploying Space Coast tech events to GitHub repositories. Now with **Val.town compatibility** and **GitHub API-only mode** for serverless environments!

## ✨ Features

- 🔍 **Event Extraction**: Scrapes multiple Space Coast Meetup groups for tech events
- 📝 **Markdown Generation**: Formats events into clean, Astro-compatible markdown
- 🔄 **Flexible Deployment**: Supports both local git operations and GitHub API-only mode
- 🌐 **Val.town Compatible**: Works in serverless environments without file system access
- 🤖 **Automated Workflows**: Perfect for scheduled event updates via GitHub Actions, Val.town, or serverless functions
- 📅 **Smart Filtering**: Filter events by month/year with Eastern timezone support
- 🔀 **Pull Request Management**: Automatically creates and manages PRs for event updates

## 🚀 Quick Start

### Val.town Deployment (Recommended for serverless)

```typescript
import { EventsDeployer } from "https://esm.town/v/yourusername/evnt-hndlr";

export default async function updateEvents() {
  const deployer = EventsDeployer.forValTown({
    githubToken: process.env.GITHUB_TOKEN,
    repoUrl: "https://github.com/yourusername/your-astro-site.git"
  });

  await deployer.deployEvents();
  return { success: true, message: "Events updated!" };
}
```

### Local Development

```bash
# Clone and setup
git clone https://github.com/SpaceCoastDevs/EvntHndlr.git
cd EvntHndlr
npm install

# Configure environment
cp .env.example .env
# Edit .env with your GitHub token and repository details

# Deploy events
npm run deploy                    # Current month, auto-detect mode
npm run deploy --api-only         # Force API-only mode (Val.town style)
npm run deploy --month=2025-08    # Specific month
npm run deploy --dry-run          # Preview without deploying
```

## 🔧 Deployment Modes

### 1. **API-Only Mode** (Val.town, Serverless)
- ✅ No local file system required
- ✅ No git binary required  
- ✅ Works in browser environments
- ✅ Perfect for Val.town, Vercel, Netlify Functions
- 🔗 Uses GitHub REST API exclusively

### 2. **Local Git Mode** (Traditional)
- ✅ Full git operation support
- ✅ Local repository caching
- ✅ Advanced git features
- 📁 Requires file system access

### 3. **Auto-Detection**
- 🧠 Automatically chooses the best mode for your environment
- 🔄 Seamless switching between modes

## 📋 Usage Examples

### Programmatic Usage

```typescript
import { 
  EventsDeployer, 
  createValTownDeployer,
  createLocalDeployer,
  createAutoDeployer 
} from 'evnt-hndlr';

// Val.town/Serverless style
const deployer = createValTownDeployer({
  githubToken: process.env.GITHUB_TOKEN,
  repoUrl: 'https://github.com/user/repo.git'
});

// Local development style
const localDeployer = createLocalDeployer();

// Auto-detect environment
const autoDeployer = createAutoDeployer();

// Deploy with custom options
await deployer.deployEvents({
  month: '2025-08',
  targetFile: 'src/content/post/august-events.mdx',
  branchPrefix: 'events-update',
  commitMessage: 'Add August 2025 events',
  prTitle: 'August 2025 Tech Events Update'
});
```

### CLI Usage

```bash
# Basic deployment
npm run deploy

# Specific month
npm run deploy --month=2025-08

# API-only mode (Val.town compatible)
npm run deploy --api-only --month=2025-08

# Custom target file
npm run deploy --file=src/content/events/meetups.mdx

# Preview mode
npm run deploy --dry-run --month=2025-08

# Force specific mode
npm run deploy --mode=local     # Force local git
npm run deploy --mode=api-only  # Force API-only
```

## ⚙️ Configuration

### Environment Variables

#### For API-Only Mode (Val.town, Serverless)
```bash
GITHUB_TOKEN=your_github_token          # Required
ASTRO_REPO_URL=https://github.com/user/repo.git  # Required
```

#### For Local Git Mode
```bash
GITHUB_TOKEN=your_github_token          # Required
ASTRO_REPO_URL=https://github.com/user/repo.git  # Required
LOCAL_REPO_PATH=/tmp/astro-site         # Required
```

### GitHub Token Permissions

Create a token at [GitHub Settings > Tokens](https://github.com/settings/tokens) with:
- `repo` (for private repositories)
- `public_repo` (for public repositories)

## 🌐 Meetup Groups Supported

- [Space Coast Devs](https://www.meetup.com/space-coast-devs/)
- [Space Coast Security](https://www.meetup.com/spacecoastsec)
- [Melbourne Makerspace](https://www.meetup.com/melbourne-makerspace-florida-usa/)
- [Melbourne R/H User Group](https://www.meetup.com/melbourne-rhug)
- [Startup Space Coast](https://www.meetup.com/startupspacecoast/)

## 📁 File Output

Generated files follow this pattern:
```
src/content/post/YYYY-MM-DD-space-coast-tech-events-MONTH-YEAR.mdx
```

Examples:
- `src/content/post/2025-08-03-space-coast-tech-events-august-2025.mdx`
- `src/content/post/2025-08-03-space-coast-tech-events-december-2025.mdx`

## 🔄 Automated Workflows

### GitHub Actions

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
      - run: npm run deploy -- --api-only
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          ASTRO_REPO_URL: ${{ github.repository }}
```

### Val.town Scheduler

```typescript
// Set this to run weekly in Val.town
export async function weeklyEventUpdate() {
  const deployer = EventsDeployer.forValTown({
    githubToken: process.env.GITHUB_TOKEN,
    repoUrl: "https://github.com/user/repo.git"
  });

  await deployer.deployEvents({
    commitMessage: "Weekly event update",
    prTitle: "Weekly Space Coast Events Update"
  });
}
```

## 🧪 Testing

```bash
# Run integration tests
npm run test-api

# Test GitHub API access
npm run deploy -- --dry-run --api-only

# Validate environment
npm run deploy -- --help
```

## 📚 Documentation

- [Val.town Integration Guide](./docs/val-town-integration.md)
- [GitHub API Examples](./docs/github-api-examples.md)
- [Git Integration Guide](./docs/git-integration.md)

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Meetup APIs  │───▶│   EvntHndlr      │───▶│  GitHub Repo    │
│   (Scraping)   │    │   (Processing)   │    │  (Deployment)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  Deployment Mode │
                    │                  │
                    │  ┌─────────────┐ │
                    │  │ Local Git   │ │  ←── Traditional
                    │  └─────────────┘ │
                    │  ┌─────────────┐ │
                    │  │ GitHub API  │ │  ←── Val.town/Serverless
                    │  └─────────────┘ │
                    └──────────────────┘
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a pull request

## 📄 License

ISC License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- [Space Coast Devs](https://spacecoastdevs.org/)
- [Val.town](https://val.town/)
- [GitHub API Documentation](https://docs.github.com/en/rest)

---

Made with ❤️ by the Space Coast Devs community