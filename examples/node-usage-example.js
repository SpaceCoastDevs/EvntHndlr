"use strict";
/**
 * Example: Node.js usage with automatic mode detection
 * Demonstrates both local git and API-only modes
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.demonstrateUsage = demonstrateUsage;
exports.cliExample = cliExample;
exports.environmentSetup = environmentSetup;
const index_1 = require("../src/index");
// Load environment variables
require("dotenv/config");
async function demonstrateUsage() {
    console.log('🚀 EvntHndlr Usage Examples\n');
    // Example 1: Auto-detection
    console.log('1. Auto-detection mode:');
    const detectedMode = (0, index_1.detectEnvironment)();
    console.log(`   Detected environment: ${detectedMode}`);
    try {
        const autoDeployer = (0, index_1.createAutoDeployer)();
        console.log('   ✅ Auto deployer created successfully\n');
    }
    catch (error) {
        console.log(`   ❌ Auto deployer failed: ${error.message}\n`);
    }
    // Example 2: Explicit API-only mode (Val.town style)
    console.log('2. API-only mode (Val.town compatible):');
    try {
        const valTownDeployer = (0, index_1.createValTownDeployer)({
            githubToken: process.env.GITHUB_TOKEN || 'test-token',
            repoUrl: process.env.ASTRO_REPO_URL || 'https://github.com/test/repo.git'
        });
        console.log('   ✅ Val.town deployer created successfully');
        // Dry run example
        if (process.env.GITHUB_TOKEN && process.env.ASTRO_REPO_URL) {
            console.log('   Running dry run...');
            await valTownDeployer.deployEvents({
                month: '2025-08',
                dryRun: true
            });
            console.log('   ✅ Dry run completed');
        }
        console.log('');
    }
    catch (error) {
        console.log(`   ❌ Val.town mode failed: ${error.message}\n`);
    }
    // Example 3: Local git mode
    console.log('3. Local git mode:');
    try {
        const localDeployer = (0, index_1.createLocalDeployer)();
        console.log('   ✅ Local deployer created successfully\n');
    }
    catch (error) {
        console.log(`   ❌ Local mode failed: ${error.message}\n`);
    }
    // Example 4: GitHub API access test
    console.log('4. GitHub API access test:');
    if (process.env.GITHUB_TOKEN && process.env.ASTRO_REPO_URL) {
        try {
            await (0, index_1.testGitHubApiAccess)(process.env.GITHUB_TOKEN, process.env.ASTRO_REPO_URL);
            console.log('   ✅ GitHub API access verified\n');
        }
        catch (error) {
            console.log(`   ❌ GitHub API test failed: ${error.message}\n`);
        }
    }
    else {
        console.log('   ⏭️  Skipped (missing GITHUB_TOKEN or ASTRO_REPO_URL)\n');
    }
    // Example 5: Manual deployment with custom options
    console.log('5. Custom deployment options:');
    try {
        const deployer = index_1.EventsDeployer.forValTown({
            githubToken: process.env.GITHUB_TOKEN || 'test-token',
            repoUrl: process.env.ASTRO_REPO_URL || 'https://github.com/test/repo.git'
        });
        // Example configuration
        const deploymentOptions = {
            month: '2025-08',
            targetFile: 'src/content/post/august-2025-events.mdx',
            branchPrefix: 'events-update',
            commitMessage: 'Add August 2025 tech events',
            prTitle: 'August 2025 Space Coast Tech Events',
            prBody: `
## 🎉 August 2025 Tech Events

This PR adds the latest tech events for August 2025 from Space Coast Meetup groups.

### 📊 Summary
- Events scraped from 5+ local tech meetup groups
- Filtered for August 2025
- Formatted for Astro site integration

### 🔍 Review Checklist
- [ ] Event dates and times are correct
- [ ] Links are working
- [ ] Formatting looks good
- [ ] No duplicate events

*This PR was generated automatically by EvntHndlr*
      `.trim(),
            dryRun: true // Safe for demo
        };
        await deployer.deployEvents(deploymentOptions);
        console.log('   ✅ Custom deployment options demonstrated\n');
    }
    catch (error) {
        console.log(`   ❌ Custom deployment failed: ${error.message}\n`);
    }
    console.log('📝 Summary:');
    console.log('   - EvntHndlr supports both local git and API-only modes');
    console.log('   - API-only mode works in Val.town, serverless, and browser environments');
    console.log('   - Auto-detection chooses the best mode for your environment');
    console.log('   - Comprehensive error handling and dry-run capabilities');
    console.log('   - Backward compatibility with existing local git workflows');
}
/**
 * CLI usage example
 */
async function cliExample() {
    console.log('\n🖥️  CLI Usage Examples:');
    console.log('');
    console.log('# Deploy current month events (auto-detect mode)');
    console.log('npm run deploy');
    console.log('');
    console.log('# Deploy specific month with API-only mode');
    console.log('npm run deploy --month=2025-08 --api-only');
    console.log('');
    console.log('# Preview what would be deployed');
    console.log('npm run deploy --month=2025-08 --dry-run');
    console.log('');
    console.log('# Force local git mode');
    console.log('npm run deploy --mode=local');
    console.log('');
    console.log('# Custom target file');
    console.log('npm run deploy --file=src/content/events/meetups.mdx --api-only');
    console.log('');
}
/**
 * Environment setup guide
 */
function environmentSetup() {
    console.log('\n⚙️  Environment Setup:');
    console.log('');
    console.log('For local development:');
    console.log('  ASTRO_REPO_URL=https://github.com/user/repo.git');
    console.log('  LOCAL_REPO_PATH=/tmp/astro-site');
    console.log('  GITHUB_TOKEN=your_github_token');
    console.log('');
    console.log('For Val.town or serverless:');
    console.log('  GITHUB_TOKEN=your_github_token  # Only this is required!');
    console.log('  ASTRO_REPO_URL=https://github.com/user/repo.git');
    console.log('');
    console.log('GitHub token permissions needed:');
    console.log('  - repo (full repository access)');
    console.log('  - Or public_repo (for public repositories only)');
    console.log('');
}
// Run examples if executed directly
if (require.main === module) {
    demonstrateUsage()
        .then(() => cliExample())
        .then(() => environmentSetup())
        .catch(console.error);
}
//# sourceMappingURL=node-usage-example.js.map