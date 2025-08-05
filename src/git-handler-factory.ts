import { GitHandler } from './git-handler';
import { GitHubApiHandler } from './github-api-handler';
import { GitConfig } from './types';

/**
 * Handler modes for different deployment environments
 */
export type HandlerMode = 'local' | 'api-only';

/**
 * Interface that both GitHandler and GitHubApiHandler implement
 * Ensures compatibility between local git and API-only approaches
 */
export interface GitOperationsHandler {
  validateRepository(): Promise<void>;
  deployMarkdown(
    markdownContent: string,
    targetFilePath: string,
    options?: {
      branchName?: string;
      commitMessage?: string;
      prTitle?: string;
      prBody?: string;
    }
  ): Promise<{
    url: string;
    number: number;
    title: string;
  }>;
  checkExistingPullRequest(branchName: string): Promise<{
    url: string;
    number: number;
    title: string;
  } | null>;
}

/**
 * Factory function to create the appropriate Git handler based on environment
 */
export function createGitOperationsHandler(
  config: GitConfig,
  mode?: HandlerMode
): GitOperationsHandler {
  // Auto-detect mode if not specified
  if (!mode) {
    mode = detectEnvironment();
  }

  console.log(`Creating Git handler in ${mode} mode`);

  switch (mode) {
    case 'local':
      return new GitHandler(config);
    case 'api-only':
      return new GitHubApiHandler(config);
    default:
      throw new Error(`Unknown handler mode: ${mode}`);
  }
}

/**
 * Detects the current environment and recommends the appropriate handler mode
 */
export function detectEnvironment(): HandlerMode {
  // Check for Val.town environment indicators
  if (typeof window !== 'undefined' && window.location?.hostname?.includes('val.town')) {
    console.log('Val.town environment detected - using API-only mode');
    return 'api-only';
  }

  // Check for Deno environment
  if (typeof (globalThis as any).Deno !== 'undefined') {
    console.log('Deno environment detected - using API-only mode');
    return 'api-only';
  }

  // Check if we're in a browser environment
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    console.log('Browser environment detected - using API-only mode');
    return 'api-only';
  }

  // Check if git and file system are available (Node.js with git)
  try {
    const fs = require('fs');
    const childProcess = require('child_process');
    
    // Test if git is available
    childProcess.execSync('git --version', { stdio: 'ignore' });
    console.log('Local git environment detected - using local mode');
    return 'local';
  } catch (error) {
    console.log('Local git not available - using API-only mode');
    return 'api-only';
  }
}

/**
 * Configuration helper for Val.town deployments
 */
export interface ValTownConfig {
  githubToken: string;
  repoUrl: string;
  targetBranch?: string;
  prTitle?: string;
  prBody?: string;
}

/**
 * Creates a GitConfig suitable for Val.town deployment
 */
export function createValTownConfig(config: ValTownConfig): GitConfig {
  return {
    repoUrl: config.repoUrl,
    repoPath: '', // Not used in API-only mode
    githubToken: config.githubToken,
    targetBranch: config.targetBranch || 'main',
    prTitle: config.prTitle || 'Update events markdown',
    prBody: config.prBody || 'Automated update of events markdown file'
  };
}

/**
 * Utility function to test GitHub API access
 */
export async function testGitHubApiAccess(token: string, repoUrl: string): Promise<void> {
  const config = createValTownConfig({ githubToken: token, repoUrl });
  const handler = createGitOperationsHandler(config, 'api-only');
  
  try {
    await handler.validateRepository();
    console.log('✅ GitHub API access test successful');
  } catch (error: any) {
    console.error('❌ GitHub API access test failed:', error.message);
    throw error;
  }
}

/**
 * Example configurations for different environments
 */
export const EXAMPLE_CONFIGS = {
  /**
   * Configuration for local development with git
   */
  local: {
    mode: 'local' as HandlerMode,
    config: {
      repoUrl: 'https://github.com/yourusername/your-astro-site.git',
      repoPath: '/tmp/astro-site',
      githubToken: 'your-github-token',
      targetBranch: 'main'
    }
  },

  /**
   * Configuration for Val.town deployment
   */
  valTown: {
    mode: 'api-only' as HandlerMode,
    config: {
      repoUrl: 'https://github.com/yourusername/your-astro-site.git',
      repoPath: '', // Not used in API-only mode
      githubToken: 'your-github-token',
      targetBranch: 'main'
    }
  },

  /**
   * Configuration for serverless/edge environments
   */
  serverless: {
    mode: 'api-only' as HandlerMode,
    config: {
      repoUrl: 'https://github.com/yourusername/your-astro-site.git',
      repoPath: '',
      githubToken: 'your-github-token',
      targetBranch: 'main'
    }
  }
} as const;