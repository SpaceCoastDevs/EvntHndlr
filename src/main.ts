import * as cheerio from "cheerio";
import TurndownService from "turndown";
import { EventData, JsonLdEvent } from "./types";

const turndownService = new TurndownService({
  bulletListMarker: "-",
});

/**
 * Extracts the first event URL from a Meetup group page
 */
async function extractFirstEvent(groupUrl: string): Promise<string> {
  try {
    const response = await (await fetch(groupUrl)).text();
    const $ = cheerio.load(response);

    const firstEvent = $("#event-card-e-1");
    if (firstEvent.length === 0) {
      return "";
    }

    const href = firstEvent.attr("href");
    return href || "";
  } catch (error) {
    console.error(`Error extracting first event from ${groupUrl}:`, error);
    return "";
  }
}

/**
 * Extracts all event URLs from a Meetup group page
 */
async function extractAllEvents(groupUrl: string): Promise<{ href: string; meetupName: string; }[]> {
  try {
    const response = await (await fetch(groupUrl)).text();
    const $ = cheerio.load(response);

    // Extract meetup name from URL
    const meetupName = $("#group-name-link").text();

    const allEvents = $('a[id^="event-card-e-"]');
    const eventUrls: { href: string; meetupName: string; }[] = [];
    const seenUrls = new Set<string>();

    allEvents.each((_:any, element:any) => {
      const href = $(element).attr("href");
      if (href && !seenUrls.has(href)) {
        seenUrls.add(href);
        eventUrls.push({ href, meetupName });
      }
    });

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
  let output = `# Space Coast Tech Meetups\n\n`
  try {
    // Generate markdown content using template literals
    output += `${records.map(post => `[${post.title}](${post.url}) via [${post.meetup_name}](${post.group_url})

  ${post.description || ''}
`).join('\n')}`;

  } catch (error) {
    console.error("Error rendering events:", error);
  }

  return output;
}

/**
 * Main function
 */
async function main(): Promise<void> {
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

  // Sort events by datetime
  const sortedEventData = eventData.sort((a, b) => {
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
  extractFirstEvent,
  getMeetupGroupList,
  main,
  renderEvents,
};