import * as cheerio from "cheerio";
import TurndownService from "turndown";
import { EventData, JsonLdEvent, RecurringEventGroup } from "./types";

const turndownService = new TurndownService({
  bulletListMarker: "-",
});

/**
 * Extracts all event URLs from a Meetup group page and its /events/ listing
 */
async function extractAllEvents(groupUrl: string): Promise<{ href: string; meetupName: string; }[]> {
  try {
    const response = await (await fetch(groupUrl)).text();
    const $ = cheerio.load(response);

    // Extract meetup name from the page
    const meetupName = $("#group-name-link").text().trim() || $('h1').first().text().trim();

    const eventUrls: { href: string; meetupName: string; }[] = [];
    const seenUrls = new Set<string>();

    // Helper to normalize and add event URLs
    const addEventUrl = (href: string) => {
      if (!href || !href.includes('/events/')) return;
      if (href.includes('/events/past') || href.includes('/events/calendar')) return;
      // Strip query params for deduplication
      const cleanUrl = href.split('?')[0].replace(/\/$/, '') + '/';
      const fullUrl = cleanUrl.startsWith('http') ? cleanUrl : `https://www.meetup.com${cleanUrl}`;
      if (!seenUrls.has(fullUrl) && /\/events\/\d+/.test(fullUrl)) {
        seenUrls.add(fullUrl);
        eventUrls.push({ href: fullUrl, meetupName });
      }
    };

    // Try to extract events from JSON-LD structured data first
    $('script[type="application/ld+json"]').each((_:any, element:any) => {
      try {
        const scriptContent = $(element).html();
        if (scriptContent) {
          const data = JSON.parse(scriptContent);
          
          // Check if it's an array of events
          if (Array.isArray(data)) {
            for (const item of data) {
              if (item['@type'] === 'Event' && item.url) {
                addEventUrl(item.url);
              }
            }
          }
        }
      } catch (e) {
        // Continue if JSON parsing fails
      }
    });

    // Also extract event links from HTML
    $('a[data-eventref], a[href*="/events/"]').each((_:any, element:any) => {
      const href = $(element).attr("href");
      if (href) addEventUrl(href);
    });

    // Fetch the /events/ listing page for a more complete list
    const eventsPageUrl = groupUrl.replace(/\/?$/, '/events/');
    try {
      const eventsResponse = await (await fetch(eventsPageUrl)).text();
      const $events = cheerio.load(eventsResponse);

      // Extract from __NEXT_DATA__ on the events listing page
      const nextDataScript = $events('#__NEXT_DATA__');
      if (nextDataScript.length > 0) {
        try {
          const nextDataContent = nextDataScript.html();
          if (nextDataContent) {
            const nextData = JSON.parse(nextDataContent);
            // Navigate the Apollo state to find event URLs
            const apolloState = nextData?.props?.pageProps?.__APOLLO_STATE__;
            if (apolloState) {
              for (const key of Object.keys(apolloState)) {
                const obj = apolloState[key];
                if (obj?.__typename === 'Event' && obj?.eventUrl) {
                  addEventUrl(obj.eventUrl);
                }
              }
            }
          }
        } catch (e) {
          // Continue if __NEXT_DATA__ parsing fails
        }
      }

      // Also extract event links from the events page HTML
      $events('a[href*="/events/"]').each((_:any, element:any) => {
        const href = $events(element).attr("href");
        if (href) addEventUrl(href);
      });
    } catch (e) {
      console.error(`Could not fetch events page ${eventsPageUrl}:`, e);
    }

    console.error(`Found ${eventUrls.length} unique events for ${groupUrl}`);
    return eventUrls;
  } catch (error) {
    console.error(`Error extracting events from ${groupUrl}:`, error);
    return [];
  }
}

/**
 * Extracts event data from a Meetup event page
 */
async function extractEventData(url: string, groupUrl: string, meetupName: string): Promise<EventData | null> {
  try {
    const response = await (await fetch(url)).text();
    const $ = cheerio.load(response);

    console.error(`Processing event: ${url} for group: ${meetupName}`);

    // Get title of the webpage
    let eventName = $("title").text();
    eventName = eventName.replace(" | Meetup", "").trim();

    // Split the event name by comma to extract date and time
    const eventParts = eventName.split(",");
    const eventTime = eventParts[eventParts.length - 1]?.trim() || "";
    const eventDate = eventParts[eventParts.length - 3]?.trim() || "";

    // Extract startDate from JSON-LD script tags
    let startDate: string | null = null;
    $('script[type="application/ld+json"]').each((_:any, element:any) => {
      try {
        const scriptContent = $(element).html();
        if (scriptContent) {
          const data = JSON.parse(scriptContent);

          if (Array.isArray(data)) {
            for (const item of data) {
              if (typeof item === "object" && item.startDate) {
                startDate = item.startDate;
                break;
              }
            }
          } else if (typeof data === "object" && data.startDate) {
            startDate = data.startDate;
          }
        }
      } catch (e) {
        // Continue if JSON parsing fails
      }
    });

    const eventDatetime = startDate;

    // Extract recurring event series info from __NEXT_DATA__
    let isRecurring = false;
    let recurrenceDescription: string | null = null;
    let cleanTitle: string | null = null;

    const nextDataScript = $('#__NEXT_DATA__');
    if (nextDataScript.length > 0) {
      try {
        const nextDataContent = nextDataScript.html();
        if (nextDataContent) {
          const nextData = JSON.parse(nextDataContent);
          const eventData = nextData?.props?.pageProps?.event;
          if (eventData?.title) {
            cleanTitle = eventData.title;
          }
          if (eventData?.series?.description) {
            isRecurring = true;
            recurrenceDescription = eventData.series.description;
            console.error(`  Recurring event detected: ${recurrenceDescription}`);
          }
        }
      } catch (e) {
        // Continue if __NEXT_DATA__ parsing fails
      }
    }

    // Use the clean title from __NEXT_DATA__ if available
    if (cleanTitle) {
      eventName = cleanTitle;
    }

    // Get description of the event
    const eventDescriptionElement = $(".break-words");
    let eventDescription: string | null = null;

    if (eventDescriptionElement.length > 0) {
      const htmlDescription = eventDescriptionElement.html();
      if (htmlDescription) {
        eventDescription = turndownService.turndown(htmlDescription);
      }
    }

    console.error(meetupName, eventName);

    return {
      title: eventName,
      url: url,
      date: eventDate,
      time: eventTime,
      group_url: groupUrl,
      meetup_name: meetupName,
      description: eventDescription,
      datetime: eventDatetime,
      isRecurring,
      recurrenceDescription,
    };
  } catch (error) {
    console.error(`Error extracting event data from ${url}:`, error);
    return null;
  }
}

/**
 * Parses a recurrence description and generates all occurrences within a target month.
 * Supports patterns like:
 *   "Every week on Tuesday until December 28, 2027"
 *   "Every week on Monday"
 *   "Every 2 weeks on Wednesday until March 1, 2028"
 *   "Every 2nd Wednesday of the month until March 11, 2026"
 *   "Every 1st Thursday of the month"
 */
function expandRecurringDates(
  event: EventData,
  filterMonth: number,
  filterYear: number,
): EventData[] {
  if (!event.isRecurring || !event.recurrenceDescription || !event.datetime) {
    return [event];
  }

  const desc = event.recurrenceDescription;
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Parse optional end date: "until Month Day, Year"
  let endDate: Date | null = null;
  const untilMatch = desc.match(/until\s+(.+)$/i);
  if (untilMatch) {
    const parsed = new Date(untilMatch[1]);
    if (!isNaN(parsed.getTime())) {
      endDate = parsed;
    }
  }

  // Get the time component from the original event
  const originalDate = new Date(event.datetime);
  const hours = originalDate.getHours();
  const minutes = originalDate.getMinutes();
  const tzMatch = event.datetime.match(/([+-]\d{2}:\d{2})$/);
  const tzSuffix = tzMatch ? tzMatch[1] : '';

  const monthEnd = new Date(filterYear, filterMonth, 0); // Last day of month

  // Helper to build an occurrence EventData for a given day
  const buildOccurrence = (day: number, isFirst: boolean): EventData => {
    const candidate = new Date(filterYear, filterMonth - 1, day);
    const monthStr = String(filterMonth).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const hourStr = String(hours).padStart(2, '0');
    const minStr = String(minutes).padStart(2, '0');
    const occDatetime = `${filterYear}-${monthStr}-${dayStr}T${hourStr}:${minStr}:00${tzSuffix}`;
    const occDate = candidate.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    });
    const occTime = originalDate.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit',
      timeZone: 'America/New_York',
    });
    return {
      ...event,
      datetime: occDatetime,
      date: occDate,
      time: occTime,
      url: isFirst ? event.url : event.group_url + 'events/',
    };
  };

  // Check for "Nth weekday of the month" pattern (e.g., "Every 2nd Wednesday of the month")
  const nthMatch = desc.match(/Every\s+(\d+)(?:st|nd|rd|th)\s+(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s+of\s+the\s+month/i);
  if (nthMatch) {
    const nthWeek = parseInt(nthMatch[1]);
    const targetDay = dayNames.findIndex(d => d.toLowerCase() === nthMatch[2].toLowerCase());
    if (targetDay === -1) return [event];

    // Find the nth occurrence of targetDay in the month
    let count = 0;
    for (let day = 1; day <= monthEnd.getDate(); day++) {
      const candidate = new Date(filterYear, filterMonth - 1, day);
      if (candidate.getDay() === targetDay) {
        count++;
        if (count === nthWeek) {
          // Check date constraints
          const originalStartOfDay = new Date(originalDate.getFullYear(), originalDate.getMonth(), originalDate.getDate()).getTime();
          if (candidate.getTime() < originalStartOfDay) return [event];
          if (endDate && candidate > endDate) return [event];
          return [buildOccurrence(day, true)];
        }
      }
    }
    return [event]; // Nth weekday doesn't exist this month
  }

  // Weekly pattern: "Every [N] week(s) on DayName"
  const dayMatch = desc.match(/on\s+(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)/i);
  if (!dayMatch) {
    return [event];
  }
  const targetDayOfWeek = dayNames.findIndex(
    d => d.toLowerCase() === dayMatch[1].toLowerCase()
  );
  if (targetDayOfWeek === -1) {
    return [event];
  }

  // Parse interval (default weekly = 1)
  let weekInterval = 1;
  const intervalMatch = desc.match(/Every\s+(\d+)\s+weeks?/i);
  if (intervalMatch) {
    weekInterval = parseInt(intervalMatch[1]);
  }

  // Generate all occurrences in the target month
  const occurrences: EventData[] = [];

  for (let day = 1; day <= monthEnd.getDate(); day++) {
    const candidate = new Date(filterYear, filterMonth - 1, day);
    if (candidate.getDay() !== targetDayOfWeek) continue;

    // Check if this date is before the original event start
    const candidateTime = candidate.getTime();
    const originalStartOfDay = new Date(originalDate.getFullYear(), originalDate.getMonth(), originalDate.getDate()).getTime();
    if (candidateTime < originalStartOfDay) continue;

    // Check the week interval - must be a multiple of weekInterval weeks from original
    if (weekInterval > 1) {
      const diffMs = candidateTime - originalStartOfDay;
      const diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
      if (diffWeeks % weekInterval !== 0) continue;
    }

    // Check end date
    if (endDate && candidate > endDate) continue;

    occurrences.push(buildOccurrence(day, occurrences.length === 0));
  }

  return occurrences.length > 0 ? occurrences : [event];
}

/**
 * Returns the list of Meetup groups to monitor
 */
function getMeetupGroupList(): string[] {
  return [
    "https://www.meetup.com/space-coast-devs/",
    "https://www.meetup.com/spacecoastsec",
    "https://www.meetup.com/melbourne-makerspace-florida-usa/",
    "https://www.meetup.com/melbourne-rhug",
    "https://www.meetup.com/startupspacecoast/",
  ];
}
/**
 * Renders the events using JavaScript template literals and writes to output file
 */
async function renderEvents(
  records: EventData[],
  recurringGroups: RecurringEventGroup[],
): Promise<string> {

  const now = new Date();
  // Get current date/time in Eastern timezone
  const easternTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const currentDay = (easternTime.getDate()).toString().padStart(2, '0');
  const currentMonth = (easternTime.getMonth() + 1).toString().padStart(2, '0');
  const currentMonthString = easternTime.toLocaleString('en-US', { month: 'long', timeZone: 'America/New_York' }).charAt(0).toUpperCase() + easternTime.toLocaleString('en-US', { month: 'long', timeZone: 'America/New_York' }).slice(1);
  const currentYear = easternTime.getFullYear();

  let output = `---
publishDate: ${currentYear}-${currentMonth}-${currentDay}T00:00:00Z
title: Space Coast Tech Events for ${currentMonthString} ${currentYear}
excerpt: List of tech events around the Space Coast for ${currentMonthString} ${currentYear}.
category: Events
tags:
  - meetups
  - events
slug: space-coast-tech-events-${currentMonthString.toLowerCase()}-${currentYear}
image: ~/assets/images/space-coast-devs-events.png
---

import CallToAction from '~/components/widgets/CallToAction.astro';
`

  try {
    // Generate markdown content using template literals
    output += `${records.map(post =>

      post.group_url === "https://www.meetup.com/space-coast-devs/" ? `
<CallToAction
  actions={[
    {
      variant: "primary",
      text: "Join us!",
      href: "${post.url}",
      target: "_blank",
      icon: "tabler:brand-meetup",
    }
  ]}
>
  <Fragment slot="title">
    [${post.title}](${post.url}) via [${post.meetup_name}](${post.group_url})
  </Fragment>
  <Fragment slot="subtitle">
  ${post.description || ''}
  </Fragment>
</CallToAction>` : `
## [${post.title}](${post.url}) via [${post.meetup_name}](${post.group_url})

${post.description ? `${post.description}` : ''}

- **Date:** ${post.date}
- **Time:** ${post.time}
- **Group:** [${post.meetup_name}](${post.group_url})
`)
      .join('\n')}`;

    // Render recurring event groups
    if (recurringGroups.length > 0) {
      output += `\n${recurringGroups.map(group => `
## ${group.title} via [${group.meetup_name}](${group.group_url})

${group.description ? `${group.description}` : ''}

- **Recurring:** ${group.recurrenceDescription}
- **Group:** [${group.meetup_name}](${group.group_url})

**Upcoming Dates:**
${group.occurrences.map(occ => {
  const d = occ.datetime ? new Date(occ.datetime) : null;
  const dateStr = d
    ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' })
    : occ.date;
  const timeStr = d
    ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
    : occ.time;
  return `- [${dateStr} at ${timeStr}](${occ.url})`;
}).join('\n')}
`).join('\n')}`;
    }

  } catch (error) {
    console.error("Error rendering events:", error);
  }

  return output;
}

/**
 * Groups recurring events by title + group, returning single events and recurring groups separately
 */
function groupRecurringEvents(events: EventData[]): { singles: EventData[]; groups: RecurringEventGroup[] } {
  const singles: EventData[] = [];
  const recurringMap = new Map<string, EventData[]>();

  for (const event of events) {
    if (event.isRecurring && event.recurrenceDescription) {
      // Key by title + group URL to group same recurring events
      const key = `${event.title}|||${event.group_url}`;
      if (!recurringMap.has(key)) {
        recurringMap.set(key, []);
      }
      recurringMap.get(key)!.push(event);
    } else {
      singles.push(event);
    }
  }

  const groups: RecurringEventGroup[] = [];
  for (const [, events] of recurringMap) {
    // Sort occurrences by datetime
    const sorted = events.sort((a, b) => {
      if (!a.datetime || !b.datetime) return 0;
      return new Date(a.datetime).getTime() - new Date(b.datetime).getTime();
    });

    // Deduplicate occurrences by date, preferring real event URLs over generated ones
    const dateMap = new Map<string, { date: string; time: string; url: string; datetime: string | null }>();
    for (const e of sorted) {
      if (!e.datetime) continue;
      // Use just the date portion as key (YYYY-MM-DD)
      const dateKey = new Date(e.datetime).toISOString().split('T')[0];
      const existing = dateMap.get(dateKey);
      // Prefer URLs with a specific event ID (contains /events/digits/) over generic ones
      const hasRealUrl = /\/events\/\d+/.test(e.url);
      const existingHasRealUrl = existing ? /\/events\/\d+/.test(existing.url) : false;
      if (!existing || (hasRealUrl && !existingHasRealUrl)) {
        dateMap.set(dateKey, {
          date: e.date,
          time: e.time,
          url: e.url,
          datetime: e.datetime,
        });
      }
    }

    const first = sorted[0];
    const dedupedOccurrences = Array.from(dateMap.values()).sort((a, b) => {
      if (!a.datetime || !b.datetime) return 0;
      return new Date(a.datetime).getTime() - new Date(b.datetime).getTime();
    });

    groups.push({
      title: first.title,
      group_url: first.group_url,
      meetup_name: first.meetup_name,
      description: first.description,
      recurrenceDescription: first.recurrenceDescription!,
      occurrences: dedupedOccurrences,
    });
  }

  // Sort groups by their first occurrence date
  groups.sort((a, b) => {
    const aDate = a.occurrences[0]?.datetime;
    const bDate = b.occurrences[0]?.datetime;
    if (!aDate || !bDate) return 0;
    return new Date(aDate).getTime() - new Date(bDate).getTime();
  });

  return { singles, groups };
}

/**
 * Filters events to only include those happening in the specified month/year.
 * For recurring events, expands them into all occurrences within the target month.
 */
function filterEventsByMonth(events: EventData[], targetMonth?: string): EventData[] {
  const now = new Date();
  // Get current date/time in Eastern timezone
  const easternTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const currentMonth = easternTime.getMonth() + 1; // getMonth() returns 0-11
  const currentYear = easternTime.getFullYear();

  let filterMonth: number;
  let filterYear: number;

  if (targetMonth) {
    // Parse the target month (format: "YYYY-MM" or just "MM")
    if (targetMonth.includes('-')) {
      const [year, month] = targetMonth.split('-');
      filterYear = parseInt(year);
      filterMonth = parseInt(month);
    } else {
      filterYear = currentYear;
      filterMonth = parseInt(targetMonth);
    }
  } else {
    // Default to current month
    filterMonth = currentMonth;
    filterYear = currentYear;
  }

  // Expand recurring events into all occurrences within the target month
  const expandedEvents: EventData[] = [];
  for (const event of events) {
    if (event.isRecurring && event.recurrenceDescription) {
      const expanded = expandRecurringDates(event, filterMonth, filterYear);
      expandedEvents.push(...expanded);
    } else {
      expandedEvents.push(event);
    }
  }

  console.error(`Expanded ${events.length} events to ${expandedEvents.length} (after recurring expansion)`);

  return expandedEvents.filter(event => {
    if (!event.datetime) return false;

    const eventDate = new Date(event.datetime);
    const eventMonth = eventDate.getMonth() + 1;
    const eventYear = eventDate.getFullYear();

    return eventMonth === filterMonth && eventYear === filterYear;
  });
}

/**
 * Main function
 */
async function main(): Promise<void> {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const monthArg = args.find(arg => arg.startsWith('--month='))?.split('=')[1] ||
    args.find(arg => arg.startsWith('-m='))?.split('=')[1];

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: npm run dev [options]
       npm run start [options]

Options:
  --month=YYYY-MM    Filter events for specific month/year (e.g., --month=2025-08)
  --month=MM         Filter events for specific month in current year (e.g., --month=08)
  -m=YYYY-MM         Short form of --month
  -h, --help         Show this help message

If no month is specified, events for the current month will be shown.

Examples:
  npm run dev --month=2025-08    # Events for August 2025
  npm run dev --month=12         # Events for December of current year
  npm run dev                    # Events for current month
`);
    return;
  }

  const groupLinks = getMeetupGroupList();
  const eventData: EventData[] = [];

  for (const groupLink of groupLinks) {
    console.error(`Processing group: ${groupLink}`);
    const allEventLinks = await extractAllEvents(groupLink);

    for (const eventLink of allEventLinks) {
      const event = await extractEventData(eventLink.href, groupLink, eventLink.meetupName);
      if (event) {
        eventData.push(event);
      }
    }
  }

  // Filter events by month
  const filteredEvents = filterEventsByMonth(eventData, monthArg);

  const monthDisplay = monthArg || `current month (${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')})`;
  console.error(`Filtered to ${filteredEvents.length} events for ${monthDisplay}`);

  // Sort events by datetime
  const sortedEventData = filteredEvents.sort((a, b) => {
    if (!a.datetime || !b.datetime) return 0;
    return new Date(a.datetime).getTime() - new Date(b.datetime).getTime();
  });

  // Group recurring events together
  const { singles, groups } = groupRecurringEvents(sortedEventData);
  console.error(`Found ${singles.length} single events and ${groups.length} recurring event groups`);

  const events = await renderEvents(singles, groups);
  console.error("Rendered events:\n");
  console.log(events);
}

// Run the main function if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

export {
  expandRecurringDates,
  extractAllEvents,
  extractEventData,
  filterEventsByMonth,
  getMeetupGroupList,
  groupRecurringEvents,
  main,
  renderEvents,
};