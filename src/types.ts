export interface EventData {
  title: string;
  url: string;
  date: string;
  time: string;
  group_url: string;
  meetup_name: string;
  description: string | null;
  datetime: string | null;
}

export interface JsonLdEvent {
  startDate?: string;
  [key: string]: any;
}

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

export interface DeploymentOptions {
  month?: string;
  targetFile?: string;  // Auto-generated if not provided: src/content/post/YYYY-MM-DD-space-coast-tech-events-MONTH-YEAR.mdx
  branchPrefix?: string;
  commitMessage?: string;
  prTitle?: string;
  prBody?: string;
  dryRun?: boolean;
}
