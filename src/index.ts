/**
 * Main entry point for the EvntHndlr library
 * Exports both local git and GitHub API-only functionality
 */

// Core types
export * from './types';
export * from './github-types';

// Main functionality
export { 
  main as extractEvents,
  renderEvents,
  filterEventsByMonth,
  getMeetupGroupList,
  extractAllEvents,
  extractEventData
} from './main';

// Local git handler (requires file system and git binary)
export { GitHandler, createGitHandler } from './git-handler';

// GitHub API-only handler (Val.town compatible)
export { GitHubApiHandler, createGitHubApiHandler } from './github-api-handler';

// High-level deployer class
export {
  EventsDeployer,
  DeploymentOptions,
  deployFromCLI
} from './deployer';

// Handler factory and utilities
export {
  createGitOperationsHandler,
  GitOperationsHandler,
  HandlerMode,
  createValTownConfig,
  ValTownConfig,
  detectEnvironment,
  testGitHubApiAccess,
  EXAMPLE_CONFIGS
} from './git-handler-factory';

// Configuration management
export {
  createGitConfigFromEnv,
  DEFAULT_GIT_CONFIG,
  EXAMPLE_CONFIG
} from './git-config';

// Test utilities
export { runTests } from './test-api-integration';

/**
 * Quick start helpers for common use cases
 */
import { EventsDeployer } from './deployer';
import { createGitOperationsHandler, detectEnvironment } from './git-handler-factory';

/**
 * Creates a deployer configured for Val.town (API-only mode)
 */
export function createValTownDeployer(config: {
  githubToken: string;
  repoUrl: string;
  targetBranch?: string;
}): EventsDeployer {
  return EventsDeployer.forValTown(config);
}

/**
 * Creates a deployer configured for local development (with git binary)
 */
export function createLocalDeployer(config?: {
  repoUrl?: string;
  repoPath?: string;
  githubToken?: string;
  targetBranch?: string;
}): EventsDeployer {
  if (config) {
    const gitConfig = {
      repoUrl: config.repoUrl || process.env.ASTRO_REPO_URL || '',
      repoPath: config.repoPath || process.env.LOCAL_REPO_PATH || '',
      githubToken: config.githubToken || process.env.GITHUB_TOKEN || '',
      targetBranch: config.targetBranch || 'main'
    };
    
    const handler = createGitOperationsHandler(gitConfig, 'local');
    return new EventsDeployer(handler, 'local');
  }
  
  return new EventsDeployer();
}

/**
 * Auto-detects environment and creates appropriate deployer
 */
export function createAutoDeployer(config?: any): EventsDeployer {
  const mode = detectEnvironment();
  return EventsDeployer.withMode(mode, config);
}