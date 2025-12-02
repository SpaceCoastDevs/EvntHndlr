# EvntHndlr

A TypeScript application that automatically scrapes tech event data from Meetup.com groups, formats them as markdown, and optionally deploys them to an Astro blog repository via GitHub pull requests.

## Features

- 🔍 **Automated Event Scraping**: Extracts event information from configured Meetup.com groups
- 📝 **Markdown Formatting**: Converts event details (title, date, time, description) into clean markdown
- 🔄 **Git Integration**: Automatically creates branches, commits, and pull requests to deploy events
- 📅 **Month Filtering**: Generate event lists for specific months or the current month
- 🚀 **Easy Deployment**: One-command deployment to your Astro blog

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- GitHub Personal Access Token (if using Git deployment features)

## Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/SpaceCoastDevs/EvntHndlr.git
   cd EvntHndlr
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables** (required for Git deployment):
   
   Create a `.env` file in the project root:
   ```bash
   # GitHub repository URL (your Astro blog)
   ASTRO_REPO_URL=https://github.com/yourusername/your-astro-site.git

   # Local path for repository operations
   LOCAL_REPO_PATH=/tmp/astro-site

   # GitHub personal access token
   GITHUB_TOKEN=your_github_token_here
   ```

   **Creating a GitHub Token**:
   - Go to [https://github.com/settings/tokens](https://github.com/settings/tokens)
   - Click "Generate new token (classic)"
   - Select scopes: `repo` (for private repos) or `public_repo` (for public repos)
   - Copy the generated token to your `.env` file

## How It Works

### 1. Event Extraction

The application scrapes Meetup.com groups defined in `src/main.ts`:

```typescript
// Meetup groups are configured in the getMeetupGroupList() function
const groupLinks = [
  'https://www.meetup.com/your-group-name/',
  // Add more groups here
];
```

For each group, it:
- Fetches all upcoming events
- Extracts event metadata (title, date, time, location)
- Parses event descriptions and converts HTML to markdown
- Filters events based on the specified month

### 2. Markdown Generation

Events are formatted as markdown with:
- Event title and Meetup group name
- Date and time information
- Event URL
- Full description in markdown format

### 3. Git Deployment (Optional)

The Git integration workflow:
1. Clones/pulls the target Astro repository
2. Creates a new feature branch
3. Writes the generated markdown to the specified file
4. Commits the changes
5. Pushes to GitHub
6. Creates a pull request for review

The deployment automatically generates filenames following this pattern:
```
src/content/post/YYYY-MM-DD-space-coast-tech-events-MONTH-YEAR.mdx
```

## Usage

### Basic Event Extraction

Extract events and output to stdout (without Git deployment):

```bash
npm run dev
```

### Build the Project

Compile TypeScript to JavaScript:

```bash
npm run build
```

Run the compiled version:

```bash
npm start
```

### Deploy to Git Repository

Deploy events for the current month:

```bash
npm run deploy
```

Deploy events for a specific month:

```bash
# Deploy for August 2025
npm run deploy -- --month=2025-08

# Deploy for December of current year
npm run deploy -- --month=12
```

Specify a custom target file:

```bash
npm run deploy -- --file=src/content/events/meetups.md
```

Dry run (preview changes without deploying):

```bash
npm run deploy -- --dryRun
```

### Command-Line Options

- `--month`: Target month in format `YYYY-MM` or `MM` (defaults to current month)
- `--file`: Custom target file path (auto-generated if not provided)
- `--dryRun`: Preview changes without creating a PR
- `--branchPrefix`: Custom branch name prefix (default: `update-events`)
- `--commitMessage`: Custom commit message
- `--prTitle`: Custom pull request title
- `--prBody`: Custom pull request description

## Project Structure

```
EvntHndlr/
├── src/
│   ├── main.ts           # Core event extraction and formatting logic
│   ├── types.ts          # TypeScript type definitions
│   ├── deployer.ts       # Deployment orchestration
│   ├── git-handler.ts    # Git operations and GitHub API interactions
│   └── git-config.ts     # Git configuration management
├── docs/
│   └── git-integration.md # Detailed Git integration documentation
├── package.json
├── tsconfig.json
└── .env                  # Environment variables (create from template)
```

## Configuration

### Adding Meetup Groups

Edit `src/main.ts` and update the `getMeetupGroupList()` function:

```typescript
function getMeetupGroupList(): string[] {
  return [
    'https://www.meetup.com/your-group-1/',
    'https://www.meetup.com/your-group-2/',
    // Add more groups here
  ];
}
```

### Customizing Output Format

The markdown template can be customized in the `renderEvents()` function in `src/main.ts`.

## Development

### Run in Development Mode

```bash
npm run dev
```

### Clean Build Artifacts

```bash
npm run clean
```

### Type Checking

TypeScript configuration is in `tsconfig.json`. The project compiles to `dist/` directory.

## Dependencies

### Core Dependencies
- **cheerio**: HTML parsing and DOM manipulation
- **turndown**: HTML to Markdown conversion
- **dotenv**: Environment variable management

### Dev Dependencies
- **TypeScript**: Static type checking
- **ts-node**: TypeScript execution for development
- **@types/node**: Node.js type definitions

## Troubleshooting

### GitHub Authentication Errors
- Verify your `GITHUB_TOKEN` has the correct permissions
- Ensure the token hasn't expired
- Check that the repository URL is correct

### Event Extraction Issues
- Verify Meetup.com group URLs are correct and public
- Check that the Meetup.com page structure hasn't changed
- Review console output for specific error messages

### Build Failures
- Run `npm run clean` to remove old build artifacts
- Ensure all dependencies are installed: `npm install`
- Check TypeScript errors: `npm run build`

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes and commit: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin feature/your-feature-name`
5. Submit a pull request

## License

ISC

## Author

Maintained by SpaceCoastDevs

## Additional Documentation

- [Git Integration Guide](docs/git-integration.md) - Detailed documentation on Git deployment features
