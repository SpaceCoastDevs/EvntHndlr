import { main as extractEvents, renderEvents, filterEventsByMonth, getMeetupGroupList, extractAllEvents, extractEventData } from './main';
import { GitHandler, createGitHandler } from './git-handler';
import { createGitConfigFromEnv, DEFAULT_GIT_CONFIG } from './git-config';
import { EventData } from './types';
import { 
  createGitOperationsHandler, 
  GitOperationsHandler, 
  HandlerMode, 
  createValTownConfig,
  ValTownConfig 
} from './git-handler-factory';

export interface DeploymentOptions {
  month?: string;
  targetFile?: string;
  branchPrefix?: string;
  commitMessage?: string;
  prTitle?: string;
  prBody?: string;
  dryRun?: boolean;
  handlerMode?: HandlerMode; // New option to choose between 'local' or 'api-only'
}

/**
 * Generates the filename for the events post based on the month
 */
function generatePostFilename(month?: string): string {
  const now = new Date();
  // Get current date/time in Eastern timezone using proper offset calculation
  const easternFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const easternDateParts = easternFormatter.formatToParts(now);
  const easternYear = parseInt(easternDateParts.find(p => p.type === 'year')?.value || '0');
  const easternMonth = parseInt(easternDateParts.find(p => p.type === 'month')?.value || '0') - 1; // Month is 0-indexed
  const easternDay = parseInt(easternDateParts.find(p => p.type === 'day')?.value || '0');
  const easternTime = new Date(easternYear, easternMonth, easternDay);

  let targetDate: Date;
  
  if (month) {
    if (month.includes('-')) {
      // Format: YYYY-MM
      const [year, monthNum] = month.split('-');
      targetDate = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
    } else {
      // Format: MM (current year)
      targetDate = new Date(easternTime.getFullYear(), parseInt(month) - 1, 1);
    }
  } else {
    // Current month
    targetDate = new Date(easternTime.getFullYear(), easternTime.getMonth(), 1);
  }
  
  const year = targetDate.getFullYear();
  const monthNum = String(targetDate.getMonth() + 1).padStart(2, '0');
  const monthName = targetDate.toLocaleString('en-US', { month: 'long', timeZone: 'America/New_York' }).toLowerCase();
  
  // Use current date for the date prefix (Eastern time)
  const datePrefix = `${easternYear}-${String(easternMonth + 1).padStart(2, '0')}-${String(easternDay).padStart(2, '0')}`;
  
  return `src/content/post/${datePrefix}-space-coast-tech-events-${monthName}-${year}.mdx`;
}

/**
 * Main integration class that handles event extraction and Git deployment
 * Now supports both local git operations and GitHub API-only mode for Val.town
 */
export class EventsDeployer {
  private gitHandler: GitOperationsHandler;
  private handlerMode: HandlerMode;

  constructor(gitHandler?: GitOperationsHandler, handlerMode?: HandlerMode) {
    this.handlerMode = handlerMode || 'local'; // Default to local for backward compatibility
    this.gitHandler = gitHandler || createGitOperationsHandler(
      createGitConfigFromEnv(), 
      this.handlerMode
    );
  }

  /**
   * Creates an EventsDeployer configured for Val.town deployment
   */
  static forValTown(config: ValTownConfig): EventsDeployer {
    const gitConfig = createValTownConfig(config);
    const handler = createGitOperationsHandler(gitConfig, 'api-only');
    return new EventsDeployer(handler, 'api-only');
  }

  /**
   * Creates an EventsDeployer with a specific handler mode
   */
  static withMode(handlerMode: HandlerMode, gitConfig?: any): EventsDeployer {
    const config = gitConfig || createGitConfigFromEnv();
    const handler = createGitOperationsHandler(config, handlerMode);
    return new EventsDeployer(handler, handlerMode);
  }

  /**
   * Extracts events for a specific month
   */
  async extractEventsForMonth(month?: string): Promise<EventData[]> {
    console.log('Extracting events from Meetup groups...');
    
    const groupLinks = getMeetupGroupList();
    const eventData: EventData[] = [];

    for (const groupLink of groupLinks) {
      console.log(`Processing group: ${groupLink}`);
      
      try {
        const allEventLinks = await extractAllEvents(groupLink);

        for (const eventLink of allEventLinks) {
          const event = await extractEventData(eventLink.href, groupLink, eventLink.meetupName);
          if (event) {
            eventData.push(event);
          }
        }
      } catch (error) {
        console.error(`Failed to process group ${groupLink}:`, error);
        // Continue with other groups
      }
    }

    // Filter events by month
    const filteredEvents = filterEventsByMonth(eventData, month);
    
    // Use Eastern time for consistent month display
    const now = new Date();
    const easternFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit'
    });
    const easternDateParts = easternFormatter.formatToParts(now);
    const easternYear = easternDateParts.find(p => p.type === 'year')?.value;
    const easternMonth = easternDateParts.find(p => p.type === 'month')?.value;
    const monthDisplay = month || `current month (${easternYear}-${easternMonth})`;
    console.log(`Filtered to ${filteredEvents.length} events for ${monthDisplay}`);

    // Sort events by datetime
    return filteredEvents.sort((a, b) => {
      if (!a.datetime || !b.datetime) return 0;
      return new Date(a.datetime).getTime() - new Date(b.datetime).getTime();
    });
  }

  /**
   * Generates the markdown content for events
   */
  async generateMarkdown(events: EventData[]): Promise<string> {
    console.log('Generating markdown content...');
    return await renderEvents(events);
  }

  /**
   * Deploys events to the repository using the configured handler mode
   */
  async deployEvents(options: DeploymentOptions = {}): Promise<void> {
    const {
      month,
      targetFile = generatePostFilename(month),
      branchPrefix = 'update-events',
      dryRun = false,
      handlerMode
    } = options;

    // Switch handler mode if requested (useful for testing different modes)
    if (handlerMode && handlerMode !== this.handlerMode) {
      console.log(`Switching from ${this.handlerMode} to ${handlerMode} mode`);
      this.handlerMode = handlerMode;
      try {
        this.gitHandler = createGitOperationsHandler(createGitConfigFromEnv(), handlerMode);
      } catch (error: any) {
        console.error(`Failed to switch to ${handlerMode} mode:`, error.message);
        throw error;
      }
    }

    console.log(`Using ${this.handlerMode} mode for deployment`);

    try {
      // Extract events
      const events = await this.extractEventsForMonth(month);
      
      if (events.length === 0) {
        console.log('No events found for the specified period');
        return;
      }

      // Generate markdown
      const markdownContent = await this.generateMarkdown(events);

      if (dryRun) {
        console.log('DRY RUN - Would deploy the following content:');
        console.log('='.repeat(50));
        console.log(markdownContent);
        console.log('='.repeat(50));
        console.log(`Target file: ${targetFile}`);
        console.log(`Handler mode: ${this.handlerMode}`);
        return;
      }

      // Generate branch name based on the month being processed (using Eastern time)
      const now = new Date();
      const easternFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit'
      });
      const easternDateParts = easternFormatter.formatToParts(now);
      const easternYear = easternDateParts.find(p => p.type === 'year')?.value;
      const easternMonth = easternDateParts.find(p => p.type === 'month')?.value;
      const monthSuffix = month || `${easternYear}-${easternMonth}`;
      
      const deploymentOptions = {
        branchName: `${branchPrefix}-${monthSuffix}`,
        commitMessage: options.commitMessage || `Update events for ${monthSuffix}`,
        prTitle: options.prTitle || `Update Space Coast Tech Events for ${monthSuffix}`,
        prBody: options.prBody || this.generatePRBody(events, month)
      };

      // Deploy to repository using the configured handler
      const pr = await this.gitHandler.deployMarkdown(
        markdownContent,
        targetFile,
        deploymentOptions
      );

      console.log(`✅ Successfully deployed events!`);
      console.log(`📋 Events processed: ${events.length}`);
      console.log(`🔧 Handler mode: ${this.handlerMode}`);
      console.log(`🔗 Pull Request: ${pr.url}`);
      console.log(`📝 PR #${pr.number}: ${pr.title}`);

    } catch (error) {
      console.error('❌ Deployment failed:', error);
      throw error;
    }
  }

  /**
   * Generates a detailed PR body with event information
   */
  private generatePRBody(events: EventData[], month?: string): string {
    // Use Eastern time for consistent month display
    const now = new Date();
    const easternFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit'
    });
    const easternDateParts = easternFormatter.formatToParts(now);
    const easternYear = easternDateParts.find(p => p.type === 'year')?.value;
    const easternMonth = easternDateParts.find(p => p.type === 'month')?.value;
    const monthDisplay = month || `${easternYear}-${easternMonth}`;
    const eventsByGroup = new Map<string, number>();
    
    // Count events by group
    events.forEach(event => {
      const count = eventsByGroup.get(event.meetup_name) || 0;
      eventsByGroup.set(event.meetup_name, count + 1);
    });

    const groupSummary = Array.from(eventsByGroup.entries())
      .map(([group, count]) => `- **${group}**: ${count} event${count !== 1 ? 's' : ''}`)
      .join('\n');

    return `
## 🤖 Automated Event Update for ${monthDisplay}

This PR contains an automated update of the Space Coast tech events markdown file.

### 📊 Summary
- **Total Events**: ${events.length}
- **Period**: ${monthDisplay}
- **Generated**: ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })} ET

### 📅 Events by Group
${groupSummary}

### 🔄 Changes
- Updated event listings from Meetup groups
- Events filtered for ${monthDisplay}
- Markdown formatted for Astro site integration
- Sorted chronologically by event date

### 🌐 Source Groups
- [Space Coast Devs](https://www.meetup.com/space-coast-devs/)
- [Space Coast Security](https://www.meetup.com/spacecoastsec)
- [Melbourne Makerspace](https://www.meetup.com/melbourne-makerspace-florida-usa/)
- [Melbourne R/H User Group](https://www.meetup.com/melbourne-rhug)
- [Startup Space Coast](https://www.meetup.com/startupspacecoast/)

*This PR was created automatically by the evnt-hndlr tool. Please review the content before merging.*
    `.trim();
  }
}

/**
 * CLI interface for the events deployer
 */
export async function deployFromCLI(): Promise<void> {
  const args = process.argv.slice(2);
  
  // Parse arguments
  const monthArg = args.find(arg => arg.startsWith('--month='))?.split('=')[1] ||
    args.find(arg => arg.startsWith('-m='))?.split('=')[1];
  
  const targetFileArg = args.find(arg => arg.startsWith('--file='))?.split('=')[1] ||
    args.find(arg => arg.startsWith('-f='))?.split('=')[1];
    
  const handlerModeArg = args.find(arg => arg.startsWith('--mode='))?.split('=')[1] as HandlerMode;
    
  const dryRun = args.includes('--dry-run') || args.includes('-d');
  const apiOnly = args.includes('--api-only') || args.includes('-a');

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: npm run deploy [options]

Options:
  --month=YYYY-MM        Filter events for specific month/year (e.g., --month=2025-08)
  --month=MM             Filter events for specific month in current year (e.g., --month=08)
  -m=YYYY-MM             Short form of --month
  
  --file=path            Target file path in the repository (default: auto-generated based on month)
  -f=path                Short form of --file
  
  --mode=MODE            Handler mode: 'local' or 'api-only' (default: auto-detect)
  --api-only             Force API-only mode (same as --mode=api-only)
  -a                     Short form of --api-only
  
  --dry-run              Show what would be deployed without actually deploying
  -d                     Short form of --dry-run
  
  -h, --help             Show this help message

Handler Modes:
  local                  Use local git operations (requires git binary and file system)
  api-only               Use GitHub API only (compatible with Val.town, serverless, browser)
  auto-detect            Automatically choose based on environment (default)

Val.town Usage:
  For Val.town deployment, use --api-only mode or set up your code like this:
  
  import { EventsDeployer } from './deployer';
  
  const deployer = EventsDeployer.forValTown({
    githubToken: 'your-token',
    repoUrl: 'https://github.com/user/repo.git'
  });
  
  await deployer.deployEvents({ month: '2025-08' });

Default File Naming:
  Files are automatically named following the pattern:
  src/content/post/YYYY-MM-DD-space-coast-tech-events-MONTH-YEAR.mdx
  
  Examples:
  - src/content/post/2025-08-03-space-coast-tech-events-august-2025.mdx
  - src/content/post/2025-08-03-space-coast-tech-events-december-2025.mdx

Environment Variables:
  For local mode:
  ASTRO_REPO_URL         URL of the repository (e.g., https://github.com/user/repo.git)
  LOCAL_REPO_PATH        Local path where repository will be cloned (e.g., /tmp/astro-site)
  GITHUB_TOKEN           GitHub personal access token with repo permissions
  
  For API-only mode:
  ASTRO_REPO_URL         URL of the repository (required)
  GITHUB_TOKEN           GitHub personal access token (required)
  LOCAL_REPO_PATH        Not used in API-only mode

Examples:
  npm run deploy --month=2025-08 --dry-run    # Preview August 2025 events
  npm run deploy --month=12 --api-only        # Deploy December events using GitHub API only
  npm run deploy --mode=local                 # Force local git mode
  npm run deploy                              # Deploy current month (auto-detect mode)
`);
    return;
  }

  try {
    const handlerMode = handlerModeArg || (apiOnly ? 'api-only' : undefined);
    const deployer = handlerMode 
      ? EventsDeployer.withMode(handlerMode)
      : new EventsDeployer(); // Use default/auto-detect
    
    await deployer.deployEvents({
      month: monthArg,
      targetFile: targetFileArg,
      dryRun,
      handlerMode
    });
    
  } catch (error: any) {
    if (error.message.includes('Missing required environment variables')) {
      console.error(`
❌ Configuration Error: ${error.message}

For local mode, please set:
export ASTRO_REPO_URL="https://github.com/yourusername/your-astro-site.git"
export LOCAL_REPO_PATH="/tmp/astro-site"
export GITHUB_TOKEN="your_github_token"

For API-only mode (Val.town, serverless), please set:
export ASTRO_REPO_URL="https://github.com/yourusername/your-astro-site.git"
export GITHUB_TOKEN="your_github_token"

Or create a .env file with these values.
      `);
    } else {
      console.error('❌ Deployment failed:', error.message);
      
      // Provide specific help for common API-only mode issues
      if (error.message.includes('git --version') || 
          error.message.includes('ENOENT') ||
          error.message.includes('spawn git')) {
        console.error(`
💡 Tip: If you're running in an environment without git (like Val.town), 
try using the --api-only flag or --mode=api-only option.
        `);
      }
    }
    process.exit(1);
  }
}

// Run the CLI function if this file is executed directly
if (require.main === module) {
  deployFromCLI().catch(console.error);
}

// Export the main class and CLI function
export { EventsDeployer as default };
