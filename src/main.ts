import * as cheerio from "cheerio";
import TurndownService from "turndown";
import { EventData, JsonLdEvent } from "./types";

const turndownService = new TurndownService({
  bulletListMarker: "-",
});

/**
 * Extracts all event URLs from a Meetup group page
 */
async function extractAllEvents(groupUrl: string): Promise<{ href: string; meetupName: string; }[]> {
  try {
    const response = await (await fetch(groupUrl)).text();
    const $ = cheerio.load(response);

    // Extract meetup name from the page
    const meetupName = $("#group-name-link").text().trim() || $('h1').first().text().trim();

    const eventUrls: { href: string; meetupName: string; }[] = [];
    const seenUrls = new Set<string>();

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
                const eventUrl = item.url;
                if (!seenUrls.has(eventUrl)) {
                  seenUrls.add(eventUrl);
                  eventUrls.push({ href: eventUrl, meetupName });
                }
              }
            }
          }
        }
      } catch (e) {
        // Continue if JSON parsing fails
      }
    });

    // Fallback: try to find event links in the HTML using data attributes
    if (eventUrls.length === 0) {
      $('a[data-eventref], a[href*="/events/"]').each((_:any, element:any) => {
        const href = $(element).attr("href");
        if (href && href.includes('/events/') && !href.includes('/events/past') && !href.includes('/events/calendar')) {
          // Make sure it's a full URL
          const fullUrl = href.startsWith('http') ? href : `https://www.meetup.com${href}`;
          if (!seenUrls.has(fullUrl) && /\/events\/\d+/.test(fullUrl)) {
            seenUrls.add(fullUrl);
            eventUrls.push({ href: fullUrl, meetupName });
          }
        }
      });
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
    };
  } catch (error) {
    console.error(`Error extracting event data from ${url}:`, error);
    return null;
  }
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


  } catch (error) {
    console.error("Error rendering events:", error);
  }

  return output;
}

/**
 * Filters events to only include those happening in the specified month/year
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

  return events.filter(event => {
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

  const events = await renderEvents(sortedEventData);
  console.error("Rendered events:\n");
  console.log(events);
}

// Run the main function if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

export {
  extractAllEvents,
  extractEventData,
  filterEventsByMonth,
  getMeetupGroupList,
  main,
  renderEvents,
};