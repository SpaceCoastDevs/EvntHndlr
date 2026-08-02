import * as cheerio from "cheerio";
import TurndownService from "turndown";
import { EventData, JsonLdEvent, RecurringEventGroup } from "./types";

const turndownService = new TurndownService({
  bulletListMarker: "-",
});

interface SourceEventLink {
  href: string;
  meetupName: string;
  requireBrevardCountyLocation?: boolean;
}

interface LumaGeoAddress {
  city?: string;
  city_state?: string;
  country?: string;
  full_address?: string;
  short_address?: string;
}

interface LumaEventItem {
  name?: string;
  url?: string;
  start_at?: string;
  timezone?: string;
  location_type?: string;
  geo_address_info?: LumaGeoAddress;
}

interface EventbriteLocation {
  name?: string;
  address?: {
    addressLocality?: string;
    addressRegion?: string;
    streetAddress?: string;
  };
}

const BREVARD_CITIES = new Set([
  "CAPE CANAVERAL",
  "COCOA",
  "COCOA BEACH",
  "GRANT-VALKARIA",
  "INDIALANTIC",
  "INDIAN HARBOUR BEACH",
  "MALABAR",
  "MELBOURNE",
  "MELBOURNE BEACH",
  "MELBOURNE VILLAGE",
  "MERRITT ISLAND",
  "MIMS",
  "PALM BAY",
  "PALM SHORES",
  "PORT ST JOHN",
  "ROCKLEDGE",
  "SATELLITE BEACH",
  "SCOTTSMOOR",
  "SHARPES",
  "SUNTREE",
  "TITUSVILLE",
  "VIERA",
  "WEST MELBOURNE",
]);

function isEventbriteSource(url: string): boolean {
  return /(^https?:\/\/)?(www\.)?eventbrite\.com\//i.test(url);
}

function getSourceImageUrl(image: unknown): string | null {
  const value = Array.isArray(image) ? image[0] : image;
  const url =
    typeof value === "string"
      ? value
      : value &&
          typeof value === "object" &&
          ("url" in value || "contentUrl" in value)
        ? value.url || value.contentUrl
        : null;
  return typeof url === "string" && /^https?:\/\//.test(url) ? url : null;
}

function isLumaSource(url: string): boolean {
  return /(^https?:\/\/)?(www\.)?luma\.com\//i.test(url);
}

function normalizeEventbriteEventUrl(href: string): string {
  const absolute = href.startsWith("http")
    ? href
    : `https://www.eventbrite.com${href}`;
  return absolute.split("?")[0].replace(/\/$/, "");
}

function isBrevardCountyLumaEvent(event: LumaEventItem): boolean {
  const locationType = (event.location_type || "").toLowerCase();
  if (locationType && locationType !== "offline") {
    return false;
  }

  const geo = event.geo_address_info;
  if (!geo) {
    return false;
  }

  const city = (geo.city || "").trim().toUpperCase();
  if (city && BREVARD_CITIES.has(city)) {
    return true;
  }

  const cityState = (geo.city_state || "").trim().toUpperCase();
  for (const brevardCity of BREVARD_CITIES) {
    if (cityState.includes(brevardCity)) {
      return true;
    }
  }

  const fullAddress =
    `${geo.full_address || ""} ${geo.short_address || ""}`.toUpperCase();
  for (const brevardCity of BREVARD_CITIES) {
    if (
      fullAddress.includes(`${brevardCity}, FL`) ||
      fullAddress.includes(` ${brevardCity} FL`)
    ) {
      return true;
    }
  }

  return false;
}

function isBrevardCountyEventbriteLocation(location: unknown): boolean {
  if (!location || typeof location !== "object") return false;

  const eventLocation = location as EventbriteLocation;
  const address = eventLocation.address;
  const city = (address?.addressLocality || "").trim().toUpperCase();
  if (city && BREVARD_CITIES.has(city)) return true;

  const locationText = [
    eventLocation.name,
    address?.streetAddress,
    address?.addressLocality,
    address?.addressRegion,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toUpperCase();

  for (const brevardCity of BREVARD_CITIES) {
    if (
      locationText.includes(`${brevardCity}, FL`) ||
      locationText.includes(` ${brevardCity} FL`)
    ) {
      return true;
    }
  }

  return false;
}

function extractJsonArrayAfterKey(html: string, key: string): unknown[] {
  const keyToken = `"${key}":`;
  const keyIndex = html.indexOf(keyToken);
  if (keyIndex === -1) {
    return [];
  }

  let cursor = keyIndex + keyToken.length;
  while (cursor < html.length && /\s/.test(html[cursor])) {
    cursor++;
  }

  if (html[cursor] !== "[") {
    return [];
  }

  const start = cursor;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (; cursor < html.length; cursor++) {
    const ch = html[cursor];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === "[") {
      depth++;
    } else if (ch === "]") {
      depth--;
      if (depth === 0) {
        const arraySlice = html.slice(start, cursor + 1);
        try {
          const parsed = JSON.parse(arraySlice);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
    }
  }

  return [];
}

async function extractEventbriteEvents(
  sourceUrl: string,
): Promise<SourceEventLink[]> {
  try {
    const html = await (await fetch(sourceUrl)).text();
    const $ = cheerio.load(html);

    const titleText = $("title").text().trim();
    const organizerFromTitle = titleText.split(" Events")[0].trim();
    const organizerName = organizerFromTitle || "Eventbrite Organizer";

    const foundEvents: SourceEventLink[] = [];
    const seenUrls = new Set<string>();

    const addEventUrl = (href: string) => {
      if (!href) return;
      const normalized = normalizeEventbriteEventUrl(href);
      if (!/\/e\//.test(normalized)) return;
      if (seenUrls.has(normalized)) return;
      seenUrls.add(normalized);
      foundEvents.push({
        href: normalized,
        meetupName: organizerName,
        requireBrevardCountyLocation: sourceUrl.includes(
          "network-launch-107498260021",
        ),
      });
    };

    // Eventbrite organizer pages embed upcomingEvents as JSON in the HTML payload.
    const upcomingEvents = extractJsonArrayAfterKey(
      html,
      "upcomingEvents",
    ) as Array<{ url?: string }>;
    for (const event of upcomingEvents) {
      if (event.url) {
        addEventUrl(event.url);
      }
    }

    // Fallback: scrape any rendered event links in case payload shape changes.
    $('a[href*="/e/"]').each((_: any, element: any) => {
      const href = $(element).attr("href");
      if (href) {
        addEventUrl(href);
      }
    });

    console.error(`Found ${foundEvents.length} unique events for ${sourceUrl}`);
    return foundEvents;
  } catch (error) {
    console.error(`Error extracting events from ${sourceUrl}:`, error);
    return [];
  }
}

async function extractLumaEvents(
  sourceUrl: string,
): Promise<SourceEventLink[]> {
  try {
    const html = await (await fetch(sourceUrl)).text();
    const $ = cheerio.load(html);

    const foundEvents: SourceEventLink[] = [];
    const seenUrls = new Set<string>();
    const titleText = $("title").text().replace(" · Luma", "").trim();
    let sourceDisplayName = titleText || "Luma";

    const addEventUrl = (href: string) => {
      if (!href) return;
      const normalizedPath = href.startsWith("/") ? href : `/${href}`;
      const absolute = href.startsWith("http")
        ? href
        : `https://luma.com${normalizedPath}`;
      const normalized = absolute.split("?")[0].replace(/\/$/, "");
      if (seenUrls.has(normalized)) return;
      seenUrls.add(normalized);
      foundEvents.push({ href: normalized, meetupName: sourceDisplayName });
    };

    // Luma event and calendar pages include JSON-LD Event entries, sometimes
    // nested in an @graph or an ItemList.
    let hasJsonLdEvent = false;
    const collectJsonLdEvents = (value: unknown) => {
      if (Array.isArray(value)) {
        value.forEach(collectJsonLdEvents);
        return;
      }
      if (!value || typeof value !== "object") return;

      const entry = value as Record<string, unknown>;
      const types = Array.isArray(entry["@type"])
        ? entry["@type"]
        : [entry["@type"]];
      if (types.includes("Event") && typeof entry.url === "string") {
        hasJsonLdEvent = true;
        addEventUrl(entry.url);
      }

      Object.values(entry).forEach(collectJsonLdEvents);
    };
    if (!sourceUrl.includes("luma.com/genai-collective")) {
      $('script[type="application/ld+json"]').each((_: any, element: any) => {
        try {
          const scriptContent = $(element).html();
          if (!scriptContent) return;
          collectJsonLdEvents(JSON.parse(scriptContent));
        } catch {
          // Continue if JSON parsing fails
        }
      });
    }

    // Luma calendar pages expose events in __NEXT_DATA__. For the AI Collective
    // source, only include events located in Brevard County.
    if (!hasJsonLdEvent) {
      const nextDataRaw = $("#__NEXT_DATA__").html();
      if (nextDataRaw) {
        try {
          const nextData = JSON.parse(nextDataRaw);
          const initialData = nextData?.props?.pageProps?.initialData;
          if (initialData?.kind === "calendar") {
            const calendarName = initialData?.data?.calendar?.name;
            if (typeof calendarName === "string" && calendarName.trim()) {
              sourceDisplayName = calendarName.trim();
            }

            const featuredItems = initialData?.data?.featured_items as
              Array<{ event?: LumaEventItem }> | undefined;
            if (Array.isArray(featuredItems)) {
              for (const item of featuredItems) {
                const event = item?.event;
                if (!event) continue;
                if (!isBrevardCountyLumaEvent(event)) continue;
                if (!event.url) continue;
                addEventUrl(event.url);
              }
            }
          }
        } catch {
          // Continue to fallback extraction if parsing fails.
        }
      }
    }

    // If no JSON-LD event is present, fall back to event-like links.
    if (!hasJsonLdEvent) {
      $('a[href*="/evt/"], a[href*="/event/"]').each((_: any, element: any) => {
        const href = $(element).attr("href");
        if (href) {
          addEventUrl(href);
        }
      });
    }

    // As a final fallback, treat the source URL itself as a single event link.
    if (foundEvents.length === 0) {
      addEventUrl(sourceUrl);
    }

    console.error(`Found ${foundEvents.length} unique events for ${sourceUrl}`);
    return foundEvents;
  } catch (error) {
    console.error(`Error extracting events from ${sourceUrl}:`, error);
    return [];
  }
}

/**
 * Extracts all event URLs from a Meetup group page and its /events/ listing
 */
async function extractAllEvents(groupUrl: string): Promise<SourceEventLink[]> {
  if (isEventbriteSource(groupUrl)) {
    return extractEventbriteEvents(groupUrl);
  }

  if (isLumaSource(groupUrl)) {
    return extractLumaEvents(groupUrl);
  }

  try {
    const response = await (await fetch(groupUrl)).text();
    const $ = cheerio.load(response);

    // Extract meetup name from the page
    const meetupName =
      $("#group-name-link").text().trim() || $("h1").first().text().trim();

    const eventUrls: { href: string; meetupName: string }[] = [];
    const seenUrls = new Set<string>();

    // Helper to normalize and add event URLs
    const addEventUrl = (href: string) => {
      if (!href || !href.includes("/events/")) return;
      if (href.includes("/events/past") || href.includes("/events/calendar"))
        return;
      // Strip query params for deduplication
      const cleanUrl = href.split("?")[0].replace(/\/$/, "") + "/";
      const fullUrl = cleanUrl.startsWith("http")
        ? cleanUrl
        : `https://www.meetup.com${cleanUrl}`;
      if (!seenUrls.has(fullUrl) && /\/events\/\d+/.test(fullUrl)) {
        seenUrls.add(fullUrl);
        eventUrls.push({ href: fullUrl, meetupName });
      }
    };

    // Try to extract events from JSON-LD structured data first
    $('script[type="application/ld+json"]').each((_: any, element: any) => {
      try {
        const scriptContent = $(element).html();
        if (scriptContent) {
          const data = JSON.parse(scriptContent);

          // Check if it's an array of events
          if (Array.isArray(data)) {
            for (const item of data) {
              if (item["@type"] === "Event" && item.url) {
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
    $('a[data-eventref], a[href*="/events/"]').each((_: any, element: any) => {
      const href = $(element).attr("href");
      if (href) addEventUrl(href);
    });

    // Fetch the /events/ listing page for a more complete list
    const eventsPageUrl = groupUrl.replace(/\/?$/, "/events/");
    try {
      const eventsResponse = await (await fetch(eventsPageUrl)).text();
      const $events = cheerio.load(eventsResponse);

      // Extract from __NEXT_DATA__ on the events listing page
      const nextDataScript = $events("#__NEXT_DATA__");
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
                if (obj?.__typename === "Event" && obj?.eventUrl) {
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
      $events('a[href*="/events/"]').each((_: any, element: any) => {
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

async function extractEventbriteEventData(
  url: string,
  groupUrl: string,
  fallbackOrganizerName: string,
  requireBrevardCountyLocation = false,
): Promise<EventData | null> {
  try {
    const html = await (await fetch(url)).text();
    const $ = cheerio.load(html);

    let eventName = $("title").text().replace(" | Eventbrite", "").trim();
    let eventDescription: string | null = null;
    let imageUrl: string | null = null;
    let startDate: string | null = null;
    let organizerName = fallbackOrganizerName;
    let isBrevardCountyLocation = !requireBrevardCountyLocation;

    $('script[type="application/ld+json"]').each((_: any, element: any) => {
      try {
        const scriptContent = $(element).html();
        if (!scriptContent) return;

        const data = JSON.parse(scriptContent);
        const entries = Array.isArray(data) ? data : [data];

        for (const entry of entries) {
          if (!entry || typeof entry !== "object") continue;
          const type = entry["@type"];
          if (type === "Event" || type === "SocialEvent") {
            if (typeof entry.name === "string" && entry.name.trim()) {
              eventName = entry.name.trim();
            }
            if (
              typeof entry.description === "string" &&
              entry.description.trim()
            ) {
              eventDescription = entry.description.trim();
            }
            if (typeof entry.startDate === "string" && entry.startDate.trim()) {
              startDate = entry.startDate.trim();
            }
            imageUrl = getSourceImageUrl(entry.image) || imageUrl;
            if (
              requireBrevardCountyLocation &&
              isBrevardCountyEventbriteLocation(entry.location)
            ) {
              isBrevardCountyLocation = true;
            }
            if (entry.organizer) {
              if (typeof entry.organizer === "string") {
                organizerName = entry.organizer;
              } else if (typeof entry.organizer.name === "string") {
                organizerName = entry.organizer.name;
              }
            }
          }
        }
      } catch {
        // Continue if JSON parsing fails
      }
    });

    if (!isBrevardCountyLocation) {
      console.error(`Skipping Eventbrite event outside Brevard County: ${url}`);
      return null;
    }

    if (!eventDescription) {
      const metaDescription = $('meta[name="description"]').attr("content");
      eventDescription = metaDescription ? metaDescription.trim() : null;
    }

    const eventDateObj = startDate ? new Date(startDate) : null;
    const eventDate = eventDateObj
      ? eventDateObj.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          timeZone: "America/New_York",
        })
      : "";
    const eventTime = eventDateObj
      ? eventDateObj.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          timeZone: "America/New_York",
        })
      : "";

    return {
      title: eventName,
      url,
      date: eventDate,
      time: eventTime,
      group_url: groupUrl,
      meetup_name: organizerName,
      description: eventDescription,
      imageUrl,
      datetime: startDate,
      isRecurring: false,
      recurrenceDescription: null,
    };
  } catch (error) {
    console.error(`Error extracting Eventbrite event data from ${url}:`, error);
    return null;
  }
}

async function extractLumaEventData(
  url: string,
  groupUrl: string,
  fallbackName: string,
): Promise<EventData | null> {
  try {
    const html = await (await fetch(url)).text();
    const $ = cheerio.load(html);

    let eventName =
      $("title").text().replace(" · Luma", "").trim() || fallbackName;
    let eventDescription: string | null = null;
    let imageUrl: string | null = null;
    let startDate: string | null = null;
    let organizerName = fallbackName;

    $('script[type="application/ld+json"]').each((_: any, element: any) => {
      try {
        const scriptContent = $(element).html();
        if (!scriptContent) return;

        const data = JSON.parse(scriptContent);
        const entries = Array.isArray(data) ? data : [data];

        for (const entry of entries) {
          if (
            !entry ||
            typeof entry !== "object" ||
            entry["@type"] !== "Event"
          ) {
            continue;
          }

          if (typeof entry.name === "string" && entry.name.trim()) {
            eventName = entry.name.trim();
          }
          if (
            typeof entry.description === "string" &&
            entry.description.trim()
          ) {
            eventDescription = entry.description.trim();
          }
          if (typeof entry.startDate === "string" && entry.startDate.trim()) {
            startDate = entry.startDate.trim();
          }
          imageUrl = getSourceImageUrl(entry.image) || imageUrl;
          if (entry.organizer) {
            if (Array.isArray(entry.organizer)) {
              const firstNamed = entry.organizer.find(
                (organizer: any) =>
                  typeof organizer?.name === "string" && organizer.name.trim(),
              );
              if (firstNamed) {
                organizerName = firstNamed.name.trim();
              }
            } else if (
              typeof entry.organizer === "object" &&
              typeof entry.organizer.name === "string"
            ) {
              organizerName = entry.organizer.name.trim();
            } else if (typeof entry.organizer === "string") {
              organizerName = entry.organizer;
            }
          }
        }
      } catch {
        // Continue if JSON parsing fails
      }
    });

    if (!eventDescription) {
      const metaDescription = $('meta[name="description"]').attr("content");
      eventDescription = metaDescription ? metaDescription.trim() : null;
    }

    const eventDateObj = startDate ? new Date(startDate) : null;
    const eventDate = eventDateObj
      ? eventDateObj.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          timeZone: "America/New_York",
        })
      : "";
    const eventTime = eventDateObj
      ? eventDateObj.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          timeZone: "America/New_York",
        })
      : "";

    return {
      title: eventName,
      url,
      date: eventDate,
      time: eventTime,
      group_url: groupUrl,
      meetup_name: organizerName,
      description: eventDescription,
      imageUrl,
      datetime: startDate,
      isRecurring: false,
      recurrenceDescription: null,
    };
  } catch (error) {
    console.error(`Error extracting Luma event data from ${url}:`, error);
    return null;
  }
}

/**
 * Extracts event data from a Meetup event page
 */
async function extractEventData(
  url: string,
  groupUrl: string,
  meetupName: string,
  requireBrevardCountyLocation = false,
): Promise<EventData | null> {
  if (isEventbriteSource(groupUrl) || isEventbriteSource(url)) {
    return extractEventbriteEventData(
      url,
      groupUrl,
      meetupName,
      requireBrevardCountyLocation,
    );
  }

  if (isLumaSource(groupUrl) || isLumaSource(url)) {
    return extractLumaEventData(url, groupUrl, meetupName);
  }

  try {
    const response = await (await fetch(url)).text();
    const $ = cheerio.load(response);

    console.error(`Processing event: ${url} for group: ${meetupName}`);

    // Get title of the webpage
    let eventName = $("title").text();
    eventName = eventName.replace(" | Meetup", "").trim();

    // Extract startDate from JSON-LD script tags
    let startDate: string | null = null;
    let imageUrl = getSourceImageUrl(
      $('meta[property="og:image"]').attr("content"),
    );
    $('script[type="application/ld+json"]').each((_: any, element: any) => {
      try {
        const scriptContent = $(element).html();
        if (scriptContent) {
          const data = JSON.parse(scriptContent);

          if (Array.isArray(data)) {
            for (const item of data) {
              if (typeof item === "object" && item.startDate) {
                startDate = item.startDate;
                imageUrl = imageUrl || getSourceImageUrl(item.image);
                break;
              }
            }
          } else if (typeof data === "object" && data.startDate) {
            startDate = data.startDate;
            imageUrl = imageUrl || getSourceImageUrl(data.image);
          }
        }
      } catch (e) {
        // Continue if JSON parsing fails
      }
    });

    const eventDatetime = startDate;
    const eventDateObj = startDate ? new Date(startDate) : null;
    const eventDate = eventDateObj
      ? eventDateObj.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          timeZone: "America/New_York",
        })
      : "";
    const eventTime = eventDateObj
      ? eventDateObj.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          timeZone: "America/New_York",
        })
      : "";

    // Extract recurring event series info from __NEXT_DATA__
    let isRecurring = false;
    let recurrenceDescription: string | null = null;
    let cleanTitle: string | null = null;

    const nextDataScript = $("#__NEXT_DATA__");
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
            console.error(
              `  Recurring event detected: ${recurrenceDescription}`,
            );
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

    // Fallback only when Meetup omits structured datetime metadata.
    let resolvedEventDate = eventDate;
    let resolvedEventTime = eventTime;
    if (!resolvedEventDate || !resolvedEventTime) {
      const eventParts = eventName.split(",");
      resolvedEventTime =
        resolvedEventTime || eventParts[eventParts.length - 1]?.trim() || "";
      resolvedEventDate =
        resolvedEventDate || eventParts[eventParts.length - 3]?.trim() || "";
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
      date: resolvedEventDate,
      time: resolvedEventTime,
      group_url: groupUrl,
      meetup_name: meetupName,
      description: eventDescription,
      imageUrl,
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
  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  // Parse optional end date: "until Month Day, Year"
  let endDate: Date | null = null;
  const untilMatch = desc.match(/until\s+(.+)$/i);
  if (untilMatch) {
    const parsed = new Date(untilMatch[1]);
    if (!isNaN(parsed.getTime())) {
      endDate = parsed;
    }
  }

  const easternFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const getEasternPart = (
    date: Date,
    type: Intl.DateTimeFormatPartTypes,
  ): string =>
    easternFormatter.formatToParts(date).find((part) => part.type === type)
      ?.value || "";

  // Read the original event's wall-clock time in the event timezone. Using
  // Date#getHours() depends on the runner timezone (UTC in Actions) and
  // shifts recurring occurrences when their Eastern offset is reapplied.
  const originalDate = new Date(event.datetime);
  const originalYear = Number(getEasternPart(originalDate, "year"));
  const originalMonth = Number(getEasternPart(originalDate, "month"));
  const originalDay = Number(getEasternPart(originalDate, "day"));
  const hours = Number(getEasternPart(originalDate, "hour"));
  const minutes = Number(getEasternPart(originalDate, "minute"));
  const tzMatch = event.datetime.match(/([+-]\d{2}:\d{2})$/);
  const tzSuffix = tzMatch ? tzMatch[1] : "";

  const monthEnd = new Date(filterYear, filterMonth, 0); // Last day of month

  // Helper to build an occurrence EventData for a given day
  const buildOccurrence = (day: number, isFirst: boolean): EventData => {
    const candidate = new Date(Date.UTC(filterYear, filterMonth - 1, day));
    const monthStr = String(filterMonth).padStart(2, "0");
    const dayStr = String(day).padStart(2, "0");
    const hourStr = String(hours).padStart(2, "0");
    const minStr = String(minutes).padStart(2, "0");
    const occDatetime = `${filterYear}-${monthStr}-${dayStr}T${hourStr}:${minStr}:00${tzSuffix}`;
    const occDate = candidate.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const occTime = originalDate.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
    });
    return {
      ...event,
      datetime: occDatetime,
      date: occDate,
      time: occTime,
      url: isFirst ? event.url : event.group_url + "events/",
    };
  };

  // Check for "Nth weekday of the month" pattern (e.g., "Every 2nd Wednesday of the month")
  const nthMatch = desc.match(
    /Every\s+(\d+)(?:st|nd|rd|th)\s+(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s+of\s+the\s+month/i,
  );
  if (nthMatch) {
    const nthWeek = parseInt(nthMatch[1]);
    const targetDay = dayNames.findIndex(
      (d) => d.toLowerCase() === nthMatch[2].toLowerCase(),
    );
    if (targetDay === -1) return [event];

    // Find the nth occurrence of targetDay in the month
    let count = 0;
    for (let day = 1; day <= monthEnd.getDate(); day++) {
      const candidate = new Date(Date.UTC(filterYear, filterMonth - 1, day));
      if (candidate.getUTCDay() === targetDay) {
        count++;
        if (count === nthWeek) {
          // Check date constraints
          const originalStartOfDay = Date.UTC(
            originalYear,
            originalMonth - 1,
            originalDay,
          );
          if (candidate.getTime() < originalStartOfDay) return [event];
          if (endDate && candidate > endDate) return [event];
          return [buildOccurrence(day, true)];
        }
      }
    }
    return [event]; // Nth weekday doesn't exist this month
  }

  // Weekly pattern: "Every [N] week(s) on DayName"
  const dayMatch = desc.match(
    /on\s+(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)/i,
  );
  if (!dayMatch) {
    return [event];
  }
  const targetDayOfWeek = dayNames.findIndex(
    (d) => d.toLowerCase() === dayMatch[1].toLowerCase(),
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
    const candidate = new Date(Date.UTC(filterYear, filterMonth - 1, day));
    if (candidate.getUTCDay() !== targetDayOfWeek) continue;

    // Check if this date is before the original event start
    const candidateTime = candidate.getTime();
    const originalStartOfDay = Date.UTC(
      originalYear,
      originalMonth - 1,
      originalDay,
    );
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
 * Returns the list of event source pages to monitor
 */
function getMeetupGroupList(): string[] {
  return [
    "https://www.meetup.com/space-coast-devs/",
    "https://www.meetup.com/spacecoastsec",
    "https://www.meetup.com/hack-the-box-meetup-melbourne-fl-us/",
    "https://www.meetup.com/melbourne-makerspace-florida-usa/",
    "https://www.meetup.com/melbourne-rhug",
    "https://www.meetup.com/startupspacecoast/",
    "https://www.eventbrite.com/o/isc2-florida-spacecoast-chapter-72982354203",
    "https://www.eventbrite.com/o/protoworkstudio-76945735013",
    "https://www.eventbrite.com/o/network-launch-107498260021",
    "https://luma.com/genai-collective",
    "https://luma.com/calendar/cal-EO6JltBLpwXrrUO",
  ];
}
/**
 * Renders the events using JavaScript template literals and writes to output file
 */
async function renderEvents(
  records: EventData[],
  recurringGroups: RecurringEventGroup[],
  targetMonth?: string,
): Promise<string> {
  const now = new Date();
  // Get current date/time in Eastern timezone
  const easternTime = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" }),
  );
  const currentDay = easternTime.getDate().toString().padStart(2, "0");
  const currentMonth = (easternTime.getMonth() + 1).toString().padStart(2, "0");
  const currentMonthString =
    easternTime
      .toLocaleString("en-US", { month: "long", timeZone: "America/New_York" })
      .charAt(0)
      .toUpperCase() +
    easternTime
      .toLocaleString("en-US", { month: "long", timeZone: "America/New_York" })
      .slice(1);
  const currentYear = easternTime.getFullYear();

  let postMonthString = currentMonthString;
  let postYear = currentYear;

  if (targetMonth) {
    const [year, month] = targetMonth.includes("-")
      ? targetMonth.split("-").map(Number)
      : [currentYear, Number(targetMonth)];

    if (
      Number.isInteger(year) &&
      Number.isInteger(month) &&
      month >= 1 &&
      month <= 12
    ) {
      const targetDate = new Date(Date.UTC(year, month - 1, 1, 12));
      postMonthString = targetDate.toLocaleString("en-US", {
        month: "long",
        timeZone: "UTC",
      });
      postYear = year;
    }
  }

  let output = `---
publishDate: ${currentYear}-${currentMonth}-${currentDay}T00:00:00Z
title: Space Coast Tech Events for ${postMonthString} ${postYear}
excerpt: List of tech events around the Space Coast for ${postMonthString} ${postYear}.
category: Events
tags:
  - meetups
  - events
slug: space-coast-tech-events-${postMonthString.toLowerCase()}-${postYear}
image: ~/assets/images/space-coast-devs-events.png
---

import CallToAction from '~/components/widgets/CallToAction.astro';
`;

  try {
    // Generate markdown content using template literals
    output += `${records
      .map((post) =>
        post.group_url === "https://www.meetup.com/space-coast-devs/"
          ? `
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
  ${post.description || ""}
  </Fragment>
</CallToAction>`
          : `
## [${post.title}](${post.url}) via [${post.meetup_name}](${post.group_url})

${post.description ? `${post.description}` : ""}

- **Date:** ${post.date}
- **Time:** ${post.time}
- **Group:** [${post.meetup_name}](${post.group_url})
`,
      )
      .join("\n")}`;

    // Render recurring event groups
    if (recurringGroups.length > 0) {
      output += `\n${recurringGroups
        .map(
          (group) => `
## ${group.title} via [${group.meetup_name}](${group.group_url})

${group.description ? `${group.description}` : ""}

- **Recurring:** ${group.recurrenceDescription}
- **Group:** [${group.meetup_name}](${group.group_url})

**Upcoming Dates:**
${group.occurrences
  .map((occ) => {
    const d = occ.datetime ? new Date(occ.datetime) : null;
    const dateStr = d
      ? d.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          timeZone: "America/New_York",
        })
      : occ.date;
    const timeStr = d
      ? d.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          timeZone: "America/New_York",
        })
      : occ.time;
    return `- [${dateStr} at ${timeStr}](${occ.url})`;
  })
  .join("\n")}
`,
        )
        .join("\n")}`;
    }
  } catch (error) {
    console.error("Error rendering events:", error);
  }

  return output;
}

/**
 * Groups recurring events by title + group, returning single events and recurring groups separately
 */
function groupRecurringEvents(events: EventData[]): {
  singles: EventData[];
  groups: RecurringEventGroup[];
} {
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
    const dateMap = new Map<
      string,
      { date: string; time: string; url: string; datetime: string | null }
    >();
    for (const e of sorted) {
      if (!e.datetime) continue;
      // Use just the date portion as key (YYYY-MM-DD)
      const dateKey = new Date(e.datetime).toISOString().split("T")[0];
      const existing = dateMap.get(dateKey);
      // Prefer URLs with a specific event ID (contains /events/digits/) over generic ones
      const hasRealUrl = /\/events\/\d+/.test(e.url);
      const existingHasRealUrl = existing
        ? /\/events\/\d+/.test(existing.url)
        : false;
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
function filterEventsByMonth(
  events: EventData[],
  targetMonth?: string,
): EventData[] {
  const now = new Date();
  // Get current date/time in Eastern timezone
  const easternTime = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" }),
  );
  const currentMonth = easternTime.getMonth() + 1; // getMonth() returns 0-11
  const currentYear = easternTime.getFullYear();

  let filterMonth: number;
  let filterYear: number;

  if (targetMonth) {
    // Parse the target month (format: "YYYY-MM" or just "MM")
    if (targetMonth.includes("-")) {
      const [year, month] = targetMonth.split("-");
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

  console.error(
    `Expanded ${events.length} events to ${expandedEvents.length} (after recurring expansion)`,
  );

  return expandedEvents.filter((event) => {
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
  const monthArg =
    args.find((arg) => arg.startsWith("--month="))?.split("=")[1] ||
    args.find((arg) => arg.startsWith("-m="))?.split("=")[1];

  if (args.includes("--help") || args.includes("-h")) {
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
      const event = await extractEventData(
        eventLink.href,
        groupLink,
        eventLink.meetupName,
        eventLink.requireBrevardCountyLocation,
      );
      if (event) {
        eventData.push(event);
      }
    }
  }

  // Filter events by month
  const filteredEvents = filterEventsByMonth(eventData, monthArg);

  const monthDisplay =
    monthArg ||
    `current month (${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")})`;
  console.error(
    `Filtered to ${filteredEvents.length} events for ${monthDisplay}`,
  );

  // Sort events by datetime
  const sortedEventData = filteredEvents.sort((a, b) => {
    if (!a.datetime || !b.datetime) return 0;
    return new Date(a.datetime).getTime() - new Date(b.datetime).getTime();
  });

  // Group recurring events together
  const { singles, groups } = groupRecurringEvents(sortedEventData);
  console.error(
    `Found ${singles.length} single events and ${groups.length} recurring event groups`,
  );

  const events = await renderEvents(singles, groups, monthArg);
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
