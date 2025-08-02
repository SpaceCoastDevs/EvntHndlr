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
