/**
 * TypeScript type definitions for GitHub REST API responses
 * Used by the Val.town-compatible GitHub API handler
 */

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  permissions?: {
    admin: boolean;
    push: boolean;
    pull: boolean;
  };
}

export interface GitHubRef {
  ref: string;
  node_id: string;
  url: string;
  object: {
    type: string;
    sha: string;
    url: string;
  };
}

export interface GitHubCommit {
  sha: string;
  url: string;
  author: {
    date: string;
    name: string;
    email: string;
  };
  committer: {
    date: string;
    name: string;
    email: string;
  };
  message: string;
  tree: {
    sha: string;
    url: string;
  };
  parents: Array<{
    sha: string;
    url: string;
  }>;
}

export interface GitHubTree {
  sha: string;
  url: string;
  tree: GitHubTreeItem[];
  truncated: boolean;
}

export interface GitHubTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree' | 'commit';
  sha: string;
  size?: number;
  url: string;
}

export interface GitHubBlob {
  sha: string;
  url: string;
  content: string;
  encoding: 'base64' | 'utf-8';
  size: number;
}

export interface GitHubContent {
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  encoding?: 'base64';
  size: number;
  name: string;
  path: string;
  content?: string;
  sha: string;
  url: string;
  git_url: string;
  html_url: string;
  download_url: string;
}

export interface GitHubPullRequest {
  id: number;
  number: number;
  state: 'open' | 'closed';
  title: string;
  body: string;
  user: {
    login: string;
    id: number;
  };
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
    sha: string;
  };
  html_url: string;
  url: string;
  created_at: string;
  updated_at: string;
}

export interface GitHubUser {
  login: string;
  id: number;
  name: string;
  email: string;
}

// Request payload types
export interface CreateBlobRequest {
  content: string;
  encoding: 'utf-8' | 'base64';
}

export interface CreateTreeRequest {
  tree: Array<{
    path: string;
    mode: '100644' | '100755' | '040000' | '160000' | '120000';
    type: 'blob' | 'tree' | 'commit';
    sha?: string;
    content?: string;
  }>;
  base_tree?: string;
}

export interface CreateCommitRequest {
  message: string;
  tree: string;
  parents: string[];
  author?: {
    name: string;
    email: string;
    date?: string;
  };
  committer?: {
    name: string;
    email: string;
    date?: string;
  };
}

export interface UpdateRefRequest {
  sha: string;
  force?: boolean;
}

export interface CreateRefRequest {
  ref: string;
  sha: string;
}

export interface CreatePullRequestRequest {
  title: string;
  head: string;
  base: string;
  body?: string;
  maintainer_can_modify?: boolean;
  draft?: boolean;
}

export interface UpdateFileRequest {
  message: string;
  content: string;
  sha?: string;
  branch?: string;
  committer?: {
    name: string;
    email: string;
  };
  author?: {
    name: string;
    email: string;
  };
}

// Error response type
export interface GitHubError {
  message: string;
  errors?: Array<{
    resource: string;
    field: string;
    code: string;
  }>;
  documentation_url?: string;
}

// Configuration for GitHub API operations
export interface GitHubApiConfig {
  owner: string;
  repo: string;
  token: string;
  baseUrl?: string;
  userAgent?: string;
}

// Utility types for common operations
export type FileContent = {
  path: string;
  content: string;
  encoding?: 'utf-8' | 'base64';
};

export type CommitAuthor = {
  name: string;
  email: string;
  date?: string;
};

export type BranchInfo = {
  name: string;
  sha: string;
  url: string;
};