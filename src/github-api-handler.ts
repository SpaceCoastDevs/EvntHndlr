import {
  GitHubRepository,
  GitHubRef,
  GitHubCommit,
  GitHubTree,
  GitHubBlob,
  GitHubContent,
  GitHubPullRequest,
  GitHubUser,
  CreateBlobRequest,
  CreateTreeRequest,
  CreateCommitRequest,
  UpdateRefRequest,
  CreateRefRequest,
  CreatePullRequestRequest,
  UpdateFileRequest,
  GitHubError,
  GitHubApiConfig,
  FileContent,
  CommitAuthor,
  BranchInfo
} from './github-types';
import { GitConfig, PullRequestResponse } from './types';

/**
 * GitHub API-only handler for Val.town compatibility
 * Provides the same interface as GitHandler but uses only GitHub REST API
 * No local file system or git binary required
 */
export class GitHubApiHandler {
  private config: GitConfig;
  private apiConfig: GitHubApiConfig;
  private baseUrl: string;

  constructor(config: GitConfig) {
    this.config = {
      targetBranch: 'main',
      prTitle: 'Update events markdown',
      prBody: 'Automated update of events markdown file',
      ...config
    };

    // Parse GitHub URL to extract owner and repo
    const [owner, repo] = this.extractOwnerRepo();
    this.apiConfig = {
      owner,
      repo,
      token: this.config.githubToken,
      baseUrl: 'https://api.github.com',
      userAgent: 'evnt-hndlr-api'
    };

    this.baseUrl = `${this.apiConfig.baseUrl}/repos/${owner}/${repo}`;
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
   * Makes a GitHub API request with proper headers and error handling
   */
  private async makeApiRequest<T = any>(
    endpoint: string,
    method: string = 'GET',
    body?: any
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    console.log(`GitHub API: ${method} ${endpoint}`);
    
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiConfig.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': this.apiConfig.userAgent!,
      'X-GitHub-Api-Version': '2022-11-28'
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
      let errorMessage: string;
      
      try {
        const errorJson: GitHubError = JSON.parse(errorText);
        errorMessage = errorJson.message;
        if (errorJson.errors) {
          const errorDetails = errorJson.errors
            .map(err => `${err.field}: ${err.code}`)
            .join(', ');
          errorMessage += ` (${errorDetails})`;
        }
      } catch {
        errorMessage = errorText || response.statusText;
      }

      console.error(`GitHub API Error:
        URL: ${url}
        Status: ${response.status} ${response.statusText}
        Response: ${errorMessage}`);
      
      throw new Error(`GitHub API request failed: ${response.status} ${errorMessage}`);
    }

    return await response.json();
  }

  /**
   * Encodes string content to base64
   */
  private encodeBase64(content: string): string {
    if (typeof Buffer !== 'undefined') {
      // Node.js environment
      return Buffer.from(content, 'utf-8').toString('base64');
    } else {
      // Browser environment (Val.town)
      return btoa(unescape(encodeURIComponent(content)));
    }
  }

  /**
   * Decodes base64 content to string
   */
  private decodeBase64(content: string): string {
    if (typeof Buffer !== 'undefined') {
      // Node.js environment
      return Buffer.from(content, 'base64').toString('utf-8');
    } else {
      // Browser environment (Val.town)
      return decodeURIComponent(escape(atob(content)));
    }
  }

  /**
   * Validates the GitHub repository configuration
   */
  async validateRepository(): Promise<void> {
    console.log('Validating repository configuration...');
    
    try {
      console.log(`Repository: ${this.apiConfig.owner}/${this.apiConfig.repo}`);
      console.log(`Repository URL: ${this.config.repoUrl}`);
      
      // Test GitHub API access by getting repository info
      const repoInfo: GitHubRepository = await this.makeApiRequest('');
      console.log(`✅ Repository accessible: ${repoInfo.full_name}`);
      console.log(`   - Private: ${repoInfo.private}`);
      console.log(`   - Default branch: ${repoInfo.default_branch}`);
      
      // Check if we have push permissions
      if (repoInfo.permissions) {
        if (!repoInfo.permissions.push) {
          console.warn('⚠️  Warning: Token may not have push permissions');
        }
      }
      
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
   * Gets information about a branch (replaces setupRepository)
   */
  async getBranchInfo(branchName?: string): Promise<BranchInfo> {
    const branch = branchName || this.config.targetBranch!;
    console.log(`Getting branch info for: ${branch}`);
    
    try {
      const ref: GitHubRef = await this.makeApiRequest(`/git/refs/heads/${branch}`);
      
      return {
        name: branch,
        sha: ref.object.sha,
        url: ref.url
      };
    } catch (error: any) {
      if (error.message.includes('404')) {
        throw new Error(`Branch '${branch}' not found in repository`);
      }
      throw error;
    }
  }

  /**
   * Creates a new branch or gets existing branch info
   */
  async createBranch(branchName: string, fromBranch?: string): Promise<BranchInfo> {
    console.log(`Setting up branch: ${branchName}`);
    
    // Check if branch already exists
    try {
      const existingBranch = await this.getBranchInfo(branchName);
      console.log(`Branch ${branchName} already exists`);
      return existingBranch;
    } catch (error: any) {
      if (!error.message.includes('404')) {
        throw error;
      }
    }

    // Branch doesn't exist, create it from the base branch
    const baseBranch = fromBranch || this.config.targetBranch!;
    const baseBranchInfo = await this.getBranchInfo(baseBranch);
    
    console.log(`Creating new branch: ${branchName} from ${baseBranch}`);
    
    const createRefRequest: CreateRefRequest = {
      ref: `refs/heads/${branchName}`,
      sha: baseBranchInfo.sha
    };
    
    const newRef: GitHubRef = await this.makeApiRequest('/git/refs', 'POST', createRefRequest);
    
    return {
      name: branchName,
      sha: newRef.object.sha,
      url: newRef.url
    };
  }

  /**
   * Gets current file content and SHA if it exists
   */
  async getFileContent(filePath: string, branch?: string): Promise<{ content: string; sha: string } | null> {
    try {
      const ref = branch ? `?ref=${branch}` : '';
      const file: GitHubContent = await this.makeApiRequest(`/contents/${filePath}${ref}`);
      
      if (file.type !== 'file' || !file.content) {
        throw new Error(`Path ${filePath} is not a file or has no content`);
      }

      const content = file.encoding === 'base64' 
        ? this.decodeBase64(file.content)
        : file.content;

      return {
        content,
        sha: file.sha
      };
    } catch (error: any) {
      if (error.message.includes('404')) {
        return null; // File doesn't exist
      }
      throw error;
    }
  }

  /**
   * Creates or updates a file using the Contents API (simple approach)
   */
  async writeMarkdownFile(filePath: string, content: string, branchName?: string): Promise<{ sha: string; commit: string }> {
    console.log(`Writing file via GitHub API: ${filePath}`);
    
    const branch = branchName || this.config.targetBranch!;
    
    // Check if file already exists
    const existingFile = await this.getFileContent(filePath, branch);
    
    if (existingFile && existingFile.content === content) {
      console.log('File already exists with identical content');
      return { sha: existingFile.sha, commit: '' };
    }

    const updateRequest: UpdateFileRequest = {
      message: `Update ${filePath}`,
      content: this.encodeBase64(content),
      branch: branch
    };

    if (existingFile) {
      updateRequest.sha = existingFile.sha;
      console.log('Updating existing file');
    } else {
      console.log('Creating new file');
    }

    const response = await this.makeApiRequest(`/contents/${filePath}`, 'PUT', updateRequest);
    
    console.log(`File ${existingFile ? 'updated' : 'created'} successfully`);
    
    return {
      sha: response.content.sha,
      commit: response.commit.sha
    };
  }

  /**
   * Creates a commit with multiple files using the Git Data API (advanced approach)
   */
  async createCommitWithFiles(
    files: FileContent[],
    message: string,
    branchName: string,
    author?: CommitAuthor
  ): Promise<{ commitSha: string; treeSha: string }> {
    console.log(`Creating commit with ${files.length} files on branch: ${branchName}`);

    // Get the current branch info
    const branchInfo = await this.getBranchInfo(branchName);
    const parentCommit: GitHubCommit = await this.makeApiRequest(`/git/commits/${branchInfo.sha}`);

    // Create blobs for all files
    const treeItems = await Promise.all(files.map(async (file) => {
      const blobRequest: CreateBlobRequest = {
        content: file.content,
        encoding: file.encoding || 'utf-8'
      };

      const blob: GitHubBlob = await this.makeApiRequest('/git/blobs', 'POST', blobRequest);

      return {
        path: file.path,
        mode: '100644' as const,
        type: 'blob' as const,
        sha: blob.sha
      };
    }));

    // Create tree
    const treeRequest: CreateTreeRequest = {
      tree: treeItems,
      base_tree: parentCommit.tree.sha
    };

    const tree: GitHubTree = await this.makeApiRequest('/git/trees', 'POST', treeRequest);

    // Create commit
    const commitRequest: CreateCommitRequest = {
      message,
      tree: tree.sha,
      parents: [branchInfo.sha]
    };

    if (author) {
      commitRequest.author = author;
      commitRequest.committer = author;
    }

    const commit: GitHubCommit = await this.makeApiRequest('/git/commits', 'POST', commitRequest);

    // Update branch reference
    const updateRefRequest: UpdateRefRequest = {
      sha: commit.sha
    };

    await this.makeApiRequest(`/git/refs/heads/${branchName}`, 'PATCH', updateRefRequest);

    console.log(`Commit created successfully: ${commit.sha}`);

    return {
      commitSha: commit.sha,
      treeSha: tree.sha
    };
  }

  /**
   * Commits changes (wrapper for simple file updates)
   */
  async commitChanges(message: string, filePaths: string[], branchName?: string): Promise<boolean> {
    // For API-only approach, this is mostly handled by writeMarkdownFile
    // This method exists for interface compatibility
    console.log('Commit changes handled by writeMarkdownFile in API mode');
    return true;
  }

  /**
   * Push branch (no-op for API approach as commits are made directly to remote)
   */
  pushBranch(branchName: string): void {
    console.log(`Push not needed for API approach - branch ${branchName} already updated remotely`);
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
    
    const prData: CreatePullRequestRequest = {
      title: title || this.config.prTitle!,
      body: body || this.config.prBody!,
      head: branchName,
      base: this.config.targetBranch!
    };

    const response: GitHubPullRequest = await this.makeApiRequest('/pulls', 'POST', prData);
    
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
      console.log(`Checking for existing PR for branch: ${this.apiConfig.owner}:${branchName}`);
      const response: GitHubPullRequest[] = await this.makeApiRequest(
        `/pulls?head=${this.apiConfig.owner}:${branchName}&state=open`
      );
      
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
      return null;
    }
  }

  /**
   * Complete workflow: validate repo, create branch, commit, and create PR
   * API-compatible version of the main deployment workflow
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

    // Create or get branch
    await this.createBranch(branchName);

    // Write markdown file
    const fileResult = await this.writeMarkdownFile(targetFilePath, markdownContent, branchName);
    
    if (!fileResult.commit) {
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

    console.log('File changes committed to remote branch');

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
 * Helper function to create and configure a GitHubApiHandler instance
 */
export function createGitHubApiHandler(config: GitConfig): GitHubApiHandler {
  return new GitHubApiHandler(config);
}