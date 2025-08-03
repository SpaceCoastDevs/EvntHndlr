import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface GitConfig {
  repoUrl: string;
  repoPath: string;
  githubToken: string;
  targetBranch?: string;
  prTitle?: string;
  prBody?: string;
}

export interface PullRequestResponse {
  url: string;
  number: number;
  title: string;
}

/**
 * Git and GitHub operations handler for Astro repositories
 */
export class GitHandler {
  private config: GitConfig;

  constructor(config: GitConfig) {
    this.config = {
      targetBranch: 'main',
      prTitle: 'Update events markdown',
      prBody: 'Automated update of events markdown file',
      ...config
    };
  }

  /**
   * Executes a git command in the repository directory
   */
  private execGitCommand(command: string): string {
    try {
      const result = execSync(command, {
        cwd: this.config.repoPath,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return result.toString().trim();
    } catch (error: any) {
      throw new Error(`Git command failed: ${command}\nError: ${error.message}`);
    }
  }

  /**
   * Makes a GitHub API request
   */
  private async makeGitHubRequest(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
    const [owner, repo] = this.extractOwnerRepo();
    const url = `https://api.github.com/repos/${owner}/${repo}${endpoint}`;
    
    console.log(`Making GitHub API request: ${method} ${url}`);
    
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.config.githubToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'evnt-hndlr'
    };

    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`GitHub API Error Details:
        URL: ${url}
        Status: ${response.status} ${response.statusText}
        Owner/Repo: ${owner}/${repo}
        Response: ${errorText}`);
      throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}\n${errorText}`);
    }

    return await response.json();
  }

  /**
   * Extracts owner and repo name from GitHub URL
   */
  private extractOwnerRepo(): [string, string] {
    const match = this.config.repoUrl.match(/github\.com[\/:]([^\/]+)\/([^\/\s]+?)(?:\.git)?$/);
    if (!match) {
      throw new Error('Invalid GitHub repository URL format');
    }
    return [match[1], match[2]];
  }

  /**
   * Validates the GitHub repository configuration
   */
  async validateRepository(): Promise<void> {
    console.log('Validating repository configuration...');
    
    try {
      const [owner, repo] = this.extractOwnerRepo();
      console.log(`Repository: ${owner}/${repo}`);
      console.log(`Repository URL: ${this.config.repoUrl}`);
      
      // Test GitHub API access by getting repository info
      const repoInfo = await this.makeGitHubRequest('');
      console.log(`✅ Repository accessible: ${repoInfo.full_name}`);
      console.log(`   - Private: ${repoInfo.private}`);
      console.log(`   - Default branch: ${repoInfo.default_branch}`);
      
    } catch (error: any) {
      console.error('❌ Repository validation failed');
      if (error.message.includes('404')) {
        throw new Error(`Repository not found or not accessible. Please check:
1. Repository URL is correct: ${this.config.repoUrl}
2. Repository exists and is accessible
3. GitHub token has proper permissions
4. Token has access to this repository`);
      }
      throw error;
    }
  }

  /**
   * Clones or updates the repository
   */
  async setupRepository(): Promise<void> {
    console.log('Setting up repository...');
    
    if (fs.existsSync(this.config.repoPath)) {
      console.log('Repository exists, updating...');
      this.execGitCommand('git fetch origin');
      this.execGitCommand(`git checkout ${this.config.targetBranch}`);
      this.execGitCommand(`git pull origin ${this.config.targetBranch}`);
    } else {
      console.log('Cloning repository...');
      const parentDir = path.dirname(this.config.repoPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      
      execSync(`git clone ${this.config.repoUrl} ${this.config.repoPath}`, {
        encoding: 'utf8',
        stdio: 'inherit'
      });
      
      this.execGitCommand(`git checkout ${this.config.targetBranch}`);
    }
  }

  /**
   * Creates a new branch for the changes or updates existing branch
   */
  createBranch(branchName: string): void {
    console.log(`Setting up branch: ${branchName}`);
    
    // Ensure we're on the target branch
    this.execGitCommand(`git checkout ${this.config.targetBranch}`);
    this.execGitCommand(`git pull origin ${this.config.targetBranch}`);
    
    // Check if branch exists locally
    try {
      const branches = this.execGitCommand('git branch --list');
      const branchExists = branches.includes(branchName);
      
      if (branchExists) {
        console.log(`Branch ${branchName} exists locally, switching to it`);
        this.execGitCommand(`git checkout ${branchName}`);
        // Try to pull latest changes from remote if it exists
        try {
          this.execGitCommand(`git pull origin ${branchName}`);
        } catch (error) {
          console.log(`No remote branch ${branchName}, will create on push`);
        }
      } else {
        // Check if branch exists on remote
        try {
          this.execGitCommand(`git fetch origin ${branchName}`);
          console.log(`Branch ${branchName} exists on remote, checking it out`);
          this.execGitCommand(`git checkout -b ${branchName} origin/${branchName}`);
        } catch (error) {
          // Branch doesn't exist remotely, create new
          console.log(`Creating new branch: ${branchName}`);
          this.execGitCommand(`git checkout -b ${branchName}`);
        }
      }
    } catch (error) {
      // Fallback: try to create new branch
      console.log(`Creating new branch: ${branchName}`);
      this.execGitCommand(`git checkout -b ${branchName}`);
    }
  }

  /**
   * Writes markdown content to a file in the repository
   */
  writeMarkdownFile(filePath: string, content: string): void {
    const fullPath = path.join(this.config.repoPath, filePath);
    const dir = path.dirname(fullPath);
    
    console.log(`Target file path: ${fullPath}`);
    
    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      console.log(`Creating directory: ${dir}`);
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Check if file already exists and compare content
    if (fs.existsSync(fullPath)) {
      const existingContent = fs.readFileSync(fullPath, 'utf8');
      if (existingContent === content) {
        console.log('File already exists with identical content');
      } else {
        console.log('File exists but content is different - will update');
      }
    } else {
      console.log('File does not exist - will create');
    }
    
    console.log(`Writing markdown to: ${fullPath}`);
    fs.writeFileSync(fullPath, content, 'utf8');
    
    console.log(`File written successfully. Size: ${content.length} characters`);
  }

  /**
   * Commits changes to the current branch
   */
  commitChanges(message: string, filePaths: string[]): boolean {
    console.log('Checking for changes to commit...');
    
    // Add specified files
    for (const filePath of filePaths) {
      console.log(`Adding file: ${filePath}`);
      this.execGitCommand(`git add "${filePath}"`);
    }
    
    // Check if there are changes to commit
    try {
      const status = this.execGitCommand('git diff --cached --name-only');
      console.log(`Files in staging area: ${status || '(none)'}`);
      
      if (!status.trim()) {
        // Check if file exists and show its status
        const overallStatus = this.execGitCommand('git status --porcelain');
        console.log(`Git status: ${overallStatus || '(clean working directory)'}`);
        
        console.log('No changes to commit');
        return false;
      }
      
      console.log(`Committing changes with message: "${message}"`);
      this.execGitCommand(`git commit -m "${message}"`);
      return true;
    } catch (error: any) {
      console.log(`Commit failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Pushes the current branch to origin
   */
  pushBranch(branchName: string): void {
    console.log(`Pushing branch: ${branchName}`);
    this.execGitCommand(`git push -u origin ${branchName}`);
  }

  /**
   * Creates a pull request on GitHub
   */
  async createPullRequest(
    branchName: string,
    title?: string,
    body?: string
  ): Promise<PullRequestResponse> {
    console.log('Creating pull request...');
    
    const prData = {
      title: title || this.config.prTitle,
      body: body || this.config.prBody,
      head: branchName,
      base: this.config.targetBranch
    };

    const response = await this.makeGitHubRequest('/pulls', 'POST', prData);
    
    return {
      url: response.html_url,
      number: response.number,
      title: response.title
    };
  }

  /**
   * Checks if a pull request already exists for the branch
   */
  async checkExistingPullRequest(branchName: string): Promise<PullRequestResponse | null> {
    try {
      const [owner] = this.extractOwnerRepo();
      console.log(`Checking for existing PR for branch: ${owner}:${branchName}`);
      const response = await this.makeGitHubRequest(`/pulls?head=${owner}:${branchName}&state=open`);
      
      if (response.length > 0) {
        const pr = response[0];
        console.log(`Found existing PR: #${pr.number} - ${pr.title}`);
        return {
          url: pr.html_url,
          number: pr.number,
          title: pr.title
        };
      }
      
      console.log('No existing PR found');
      return null;
    } catch (error: any) {
      console.log(`Could not check for existing pull request: ${error.message}`);
      // Don't throw error, just return null - this allows the process to continue
      // The 404 might just mean the repo doesn't have any PRs yet
      return null;
    }
  }

  /**
   * Complete workflow: setup repo, create branch, commit, push, and create PR
   */
  async deployMarkdown(
    markdownContent: string,
    targetFilePath: string,
    options: {
      branchName?: string;
      commitMessage?: string;
      prTitle?: string;
      prBody?: string;
    } = {}
  ): Promise<PullRequestResponse> {
    const branchName = options.branchName || `update-events-${new Date().toISOString().slice(0, 7)}`;
    const commitMessage = options.commitMessage || `Update events markdown - ${new Date().toISOString().slice(0, 10)}`;

    // Validate repository access first
    await this.validateRepository();

    // Setup repository
    await this.setupRepository();

    // Create or switch to branch
    this.createBranch(branchName);

    // Write markdown file
    this.writeMarkdownFile(targetFilePath, markdownContent);

    // Commit changes
    const hasChanges = this.commitChanges(commitMessage, [targetFilePath]);
    
    if (!hasChanges) {
      // Check for existing PR even if no new changes
      const existingPr = await this.checkExistingPullRequest(branchName);
      if (existingPr) {
        console.log(`No new changes, but PR already exists: ${existingPr.url}`);
        return existingPr;
      } else {
        console.log('No changes detected and no existing PR found');
        throw new Error('No changes to commit');
      }
    }

    // Push branch
    this.pushBranch(branchName);

    // Check for existing PR before creating new one
    const existingPr = await this.checkExistingPullRequest(branchName);
    if (existingPr) {
      console.log(`Pull request already exists and has been updated: ${existingPr.url}`);
      return existingPr;
    }

    // Create pull request
    const pr = await this.createPullRequest(
      branchName,
      options.prTitle,
      options.prBody
    );

    console.log(`Pull request created: ${pr.url}`);
    return pr;
  }
}

/**
 * Helper function to create and configure a GitHandler instance
 */
export function createGitHandler(config: GitConfig): GitHandler {
  return new GitHandler(config);
}
