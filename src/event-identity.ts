export interface SourceIdentity {
  provider: "meetup" | "eventbrite" | "luma";
  id: string;
}

/** Identity belongs to the provider occurrence, never its date/title/URL slug. */
export function getSourceIdentity(sourceUrl: string): SourceIdentity | null {
  const url = new URL(sourceUrl);
  const host = url.hostname.replace(/^www\./, "");
  const meetupId =
    host === "meetup.com" && url.pathname.match(/\/events\/([^/]+)/)?.[1];
  if (meetupId) return { provider: "meetup", id: meetupId };
  const eventbriteId =
    host === "eventbrite.com" &&
    url.pathname.match(/\/e\/(?:.*-)?(\d+)\/?$/)?.[1];
  if (eventbriteId) return { provider: "eventbrite", id: eventbriteId };
  const lumaId =
    (host === "luma.com" || host === "lu.ma") &&
    url.pathname.match(/^\/([^/]+)\/?$/)?.[1];
  return lumaId ? { provider: "luma", id: lumaId } : null;
}

export const sourceIdentityKey = (identity: SourceIdentity): string =>
  JSON.stringify([identity.provider, identity.id]);

/** Select only the requested Meetup occurrence, including JSON-LD @graph layouts. */
export function selectMeetupEvent(
  objects: unknown[],
  requestedUrl: string,
): Record<string, any> | null {
  const requested = getSourceIdentity(requestedUrl);
  if (requested?.provider !== "meetup") return null;
  const candidates: Record<string, any>[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object") return;
    const object = value as Record<string, any>;
    if (object.startDate) candidates.push(object);
    if (object["@graph"]) visit(object["@graph"]);
  };
  objects.forEach(visit);
  const identified = candidates.filter(
    (event) => typeof event.url === "string",
  );
  const matches = identified.filter((event) => {
    try {
      const identity = getSourceIdentity(event.url);
      return (
        identity && sourceIdentityKey(identity) === sourceIdentityKey(requested)
      );
    } catch {
      return false;
    }
  });
  // Do not silently use another event's date, or guess between multiple anonymous events.
  if (matches.length === 1) return matches[0];
  if (
    matches.length > 1 &&
    matches.every((event) => event.startDate === matches[0].startDate)
  )
    return matches[0];
  return candidates.length === 1 && identified.length === 0
    ? candidates[0]
    : null;
}
