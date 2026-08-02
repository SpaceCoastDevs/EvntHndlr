import { promises as fs } from "fs";
import path from "path";
import {
  extractAllEvents,
  extractEventData,
  filterEventsByMonth,
  getMeetupGroupList,
  groupRecurringEvents,
  renderEvents,
} from "./main";
import { EventCost, EventData } from "./types";

interface GeneratedEventRecord {
  slug: string;
  title: string;
  start: string;
  attendanceMode: "inPerson";
  organizer: { name: string; url: string };
  sourceUrl: string;
  description: string;
  imageUrl?: string;
  cost?: EventCost;
  tags: string[];
}

const slugify = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const groupDirectoryOverrides: Record<string, string> = {
  "spacecoastsec-space-coast-s-information-security-community": "spacecoastsec",
};

const getGroupDirectory = (organizerName: string): string => {
  const organizerSlug = slugify(organizerName);
  return groupDirectoryOverrides[organizerSlug] || organizerSlug;
};

const getEasternDate = (date: Date): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";
  return `${getPart("year")}-${getPart("month")}-${getPart("day")}`;
};

const toEventRecord = (event: EventData): GeneratedEventRecord | null => {
  if (!event.datetime) return null;
  const start = new Date(event.datetime);
  if (Number.isNaN(start.getTime())) return null;

  return {
    slug: slugify(event.title),
    title: event.title,
    start: event.datetime,
    attendanceMode: "inPerson",
    organizer: { name: event.meetup_name, url: event.group_url },
    sourceUrl: event.url,
    description: event.description || "",
    ...(event.imageUrl ? { imageUrl: event.imageUrl } : {}),
    ...(event.cost ? { cost: event.cost } : {}),
    tags: ["community"],
  };
};

async function writeEventRecords(
  events: EventData[],
  eventsDirectory: string,
): Promise<number> {
  const records = events
    .map(toEventRecord)
    .filter((record): record is GeneratedEventRecord => record !== null)
    .sort((a, b) => a.start.localeCompare(b.start));
  const uniqueRecords = new Map(
    records.map((record) => {
      const filename = `${getEasternDate(new Date(record.start))}-${slugify(record.title)}`;
      return [
        `${getGroupDirectory(record.organizer.name)}/${filename}`,
        record,
      ];
    }),
  );

  await Promise.all(
    Array.from(uniqueRecords.entries()).map(async ([relativePath, record]) => {
      const outputFile = path.join(eventsDirectory, `${relativePath}.json`);
      await fs.mkdir(path.dirname(outputFile), { recursive: true });
      await fs.writeFile(
        outputFile,
        `${JSON.stringify(record, null, 2)}\n`,
        "utf8",
      );
    }),
  );

  return uniqueRecords.size;
}

function generatePostFilename(month?: string): string {
  const now = new Date();
  const easternFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const easternDateParts = easternFormatter.formatToParts(now);
  const easternYear = parseInt(
    easternDateParts.find((p) => p.type === "year")?.value || "0",
    10,
  );
  const easternMonth =
    parseInt(
      easternDateParts.find((p) => p.type === "month")?.value || "0",
      10,
    ) - 1;
  const easternDay = parseInt(
    easternDateParts.find((p) => p.type === "day")?.value || "0",
    10,
  );

  let targetDate: Date;
  if (month) {
    if (month.includes("-")) {
      const [year, monthNum] = month.split("-");
      targetDate = new Date(parseInt(year, 10), parseInt(monthNum, 10) - 1, 1);
    } else {
      targetDate = new Date(easternYear, parseInt(month, 10) - 1, 1);
    }
  } else {
    targetDate = new Date(easternYear, easternMonth, 1);
  }

  const year = targetDate.getFullYear();
  const monthName = targetDate
    .toLocaleString("en-US", { month: "long", timeZone: "America/New_York" })
    .toLowerCase();

  const datePrefix = `${easternYear}-${String(easternMonth + 1).padStart(2, "0")}-${String(easternDay).padStart(2, "0")}`;
  return `src/content/post/${datePrefix}-space-coast-tech-events-${monthName}-${year}.mdx`;
}

async function collectEvents(month?: string): Promise<EventData[]> {
  const groupLinks = getMeetupGroupList();
  const eventData: EventData[] = [];

  for (const groupLink of groupLinks) {
    console.error(`Processing group: ${groupLink}`);
    const allEventLinks = await extractAllEvents(groupLink);

    for (const eventLink of allEventLinks) {
      const event = await extractEventData(
        eventLink.href,
        groupLink,
        eventLink.meetupName,
      );
      if (event) {
        eventData.push(event);
      }
    }
  }

  const filteredEvents = filterEventsByMonth(eventData, month);
  const sortedEventData = filteredEvents.sort((a, b) => {
    if (!a.datetime || !b.datetime) return 0;
    return new Date(a.datetime).getTime() - new Date(b.datetime).getTime();
  });

  return sortedEventData;
}

async function generateEventsMarkdown(month?: string): Promise<string> {
  const sortedEventData = await collectEvents(month);
  const { singles, groups } = groupRecurringEvents(sortedEventData);
  return renderEvents(singles, groups, month);
}

export async function generateFromCLI(): Promise<void> {
  const args = process.argv.slice(2);

  const monthArg =
    args.find((arg) => arg.startsWith("--month="))?.split("=")[1] ||
    args.find((arg) => arg.startsWith("-m="))?.split("=")[1];

  const targetFileArg =
    args.find((arg) => arg.startsWith("--file="))?.split("=")[1] ||
    args.find((arg) => arg.startsWith("-f="))?.split("=")[1];

  const stdout = args.includes("--stdout");
  const noMarkdown = args.includes("--no-markdown");
  const eventsDirectoryArg =
    args.find((arg) => arg.startsWith("--event-dir="))?.split("=")[1] ||
    args.find((arg) => arg.startsWith("--events-dir="))?.split("=")[1];

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Usage: npm run generate [options]

Options:
  --month=YYYY-MM        Filter events for specific month/year (e.g., --month=2026-09)
  --month=MM             Filter events for specific month in current year (e.g., --month=09)
  -m=YYYY-MM             Short form of --month

  --file=path            Output file path (default: auto-generated post path)
  -f=path                Short form of --file

  --event-dir=path       Write canonical event JSON records to this directory
  --events-dir=path      Alias for --event-dir
  --no-markdown          Skip the legacy Markdown post output

  --stdout               Print markdown to stdout instead of writing a file
  -h, --help             Show this help message

Examples:
  npm run generate -- --month=2026-09
  npm run generate -- --month=09 --file=src/content/post/events.mdx
  npm run generate -- --stdout
`);
    return;
  }

  const events = await collectEvents(monthArg);
  const { singles, groups } = groupRecurringEvents(events);
  const markdown = await renderEvents(singles, groups, monthArg);

  if (stdout) {
    console.log(markdown);
    return;
  }

  if (!noMarkdown) {
    const outputFile = targetFileArg || generatePostFilename(monthArg);
    const outputDir = path.dirname(outputFile);
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(outputFile, markdown, "utf8");

    console.log(`Wrote events markdown to ${outputFile}`);
  }

  if (eventsDirectoryArg) {
    const count = await writeEventRecords(events, eventsDirectoryArg);
    console.log(`Wrote ${count} event records to ${eventsDirectoryArg}`);
  }
}

if (require.main === module) {
  generateFromCLI().catch((error: any) => {
    console.error(
      "Failed to generate events markdown:",
      error.message || error,
    );
    process.exit(1);
  });
}
