const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  mkdtemp,
  readFile,
  writeFile,
  mkdir,
  readdir,
  rm,
} = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const {
  getSourceIdentity,
  selectMeetupEvent,
} = require("../dist/event-identity");
const { writeEventRecords } = require("../dist/generate");
const {
  extractEventData,
  filterEventsByMonth,
  expandRecurringDates,
} = require("../dist/main");

const event = (id = "123", overrides = {}) => ({
  title: "Monthly Meetup",
  url: `https://www.meetup.com/group/events/${id}/`,
  date: "Wed, Nov 18",
  time: "6:00 PM",
  group_url: "https://www.meetup.com/group/",
  meetup_name: "Group",
  description: "Test event",
  datetime: "2026-11-18T18:00:00-05:00",
  endDatetime: "2026-11-18T20:00:00-05:00",
  isRecurring: false,
  recurrenceDescription: null,
  ...overrides,
});
const temp = async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "event-identity-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
};
const snapshot = async (dir) => {
  const files = {};
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      for (const [name, text] of Object.entries(
        await snapshot(path.join(dir, entry.name)),
      ))
        files[`${entry.name}/${name}`] = text;
    } else
      files[entry.name] = await readFile(path.join(dir, entry.name), "utf8");
  }
  return files;
};

test("provider identity survives slug/query changes and namespaces identical numbers", () => {
  assert.deepEqual(
    getSourceIdentity("https://eventbrite.com/e/new-title-tickets-123/?ref=x"),
    { provider: "eventbrite", id: "123" },
  );
  assert.deepEqual(
    getSourceIdentity("https://www.meetup.com/group/events/123/?ref=x"),
    { provider: "meetup", id: "123" },
  );
  assert.deepEqual(getSourceIdentity("https://luma.com/abc"), {
    provider: "luma",
    id: "abc",
  });
  assert.equal(getSourceIdentity("https://www.meetup.com/group/events/"), null);
});

test("JSON-LD chooses matching occurrence, not a related event; supports graph and singleton fallback", () => {
  const target = event().url;
  const wrong = {
    url: event("999").url,
    startDate: "2026-12-16T18:00:00-05:00",
  };
  const right = { url: target, startDate: event().datetime };
  assert.equal(
    selectMeetupEvent([{ "@graph": [wrong, right] }], target),
    right,
  );
  assert.equal(selectMeetupEvent([wrong], target), null);
  assert.equal(
    selectMeetupEvent([{ startDate: "a" }, { startDate: "b" }], target),
    null,
  );
  assert.deepEqual(selectMeetupEvent([{ startDate: "a" }], target), {
    startDate: "a",
  });
});

test("Meetup extraction rejects foreign metadata instead of assigning its datetime", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  const html = (entries, next = {}) =>
    `<title>Example | Meetup</title><script type="application/ld+json">${JSON.stringify(entries)}</script><script id="__NEXT_DATA__">${JSON.stringify({ props: { pageProps: { event: next } } })}</script>`;
  global.fetch = async () =>
    new Response(
      html([{ url: event("999").url, startDate: event().datetime }]),
    );
  assert.equal(
    await extractEventData(event().url, event().group_url, "Group"),
    null,
  );
  global.fetch = async () =>
    new Response(
      html([{ url: event().url, startDate: event().datetime }], { id: "999" }),
    );
  assert.equal(
    await extractEventData(event().url, event().group_url, "Group"),
    null,
  );
  global.fetch = async () =>
    new Response(
      html(
        [
          { url: event("999").url, startDate: "2026-12-16" },
          { url: event().url, startDate: event().datetime },
        ],
        { id: "123", title: "Monthly Meetup" },
      ),
    );
  assert.equal(
    (await extractEventData(event().url, event().group_url, "Group")).datetime,
    event().datetime,
  );
});

test("Nov/Dec retain distinct provider IDs; filtering does not invent recurring pages", async (t) => {
  const dir = await temp(t);
  const nov = event("123", {
    isRecurring: true,
    recurrenceDescription: "Every 3rd Wednesday of the month",
  });
  const dec = event("456", { datetime: "2026-12-16T18:00:00-05:00" });
  assert.deepEqual(
    filterEventsByMonth([nov, dec], "2026-12").map((e) => e.url),
    [dec.url],
  );
  assert.equal(
    expandRecurringDates(nov, 12, 2026)[0].url,
    "https://www.meetup.com/group/events/",
  );
  await writeEventRecords([nov, dec], dir);
  const records = Object.values(await snapshot(dir)).map(JSON.parse);
  assert.deepEqual(records.map((e) => e.sourceIdentity.id).sort(), [
    "123",
    "456",
  ]);
});

test("reruns are idempotent; reschedule/rename retains provider ID and local metadata", async (t) => {
  const dir = await temp(t);
  await writeEventRecords([event()], dir);
  const oldPath = path.join(dir, "group/2026-11-18-monthly-meetup.json");
  const record = JSON.parse(await readFile(oldPath, "utf8"));
  await writeFile(
    oldPath,
    JSON.stringify({
      ...record,
      featured: true,
      calendarId: "stable-local",
      imageUrl: "/local.png",
    }),
  );
  await writeEventRecords(
    [
      event("123", {
        title: "Renamed Meetup",
        datetime: "2026-11-19T18:00:00-05:00",
        imageUrl: "https://remote.test/new.png",
      }),
    ],
    dir,
  );
  const files = await snapshot(dir);
  assert.deepEqual(Object.keys(files), [
    "group/2026-11-19-renamed-meetup.json",
  ]);
  const saved = JSON.parse(Object.values(files)[0]);
  assert.deepEqual(saved.sourceIdentity, { provider: "meetup", id: "123" });
  assert.equal(saved.calendarId, "stable-local");
  assert.equal(saved.featured, true);
  assert.equal(saved.imageUrl, "/local.png");
  await writeEventRecords(
    [
      event("123", {
        title: "Renamed Meetup",
        datetime: "2026-11-19T18:00:00-05:00",
        imageUrl: "https://remote.test/new.png",
      }),
    ],
    dir,
  );
  assert.deepEqual(await snapshot(dir), files);
});

test("same title/date with different IDs and conflicting same ID input fail before writes", async (t) => {
  const dir = await temp(t);
  await writeEventRecords([event("old")], dir);
  const before = await snapshot(dir);
  await assert.rejects(
    writeEventRecords([event("a"), event("b")], dir),
    /Distinct occurrences/,
  );
  await assert.rejects(
    writeEventRecords(
      [event("a"), event("a", { datetime: "2026-12-16T18:00:00-05:00" })],
      dir,
    ),
    /Conflicting snapshots/,
  );
  await assert.rejects(
    writeEventRecords([event("new")], dir),
    /unrelated event/,
  );
  assert.deepEqual(await snapshot(dir), before);
});

test("ambiguous historical reused URLs remain untouched; generic/manual files are not purged", async (t) => {
  const dir = await temp(t);
  await writeEventRecords([event()], dir);
  const old = path.join(dir, "group/2026-11-18-monthly-meetup.json");
  const record = JSON.parse(await readFile(old, "utf8"));
  await writeFile(
    path.join(dir, "group/legacy.json"),
    JSON.stringify({ ...record, start: "2026-10-21T18:00:00-04:00" }),
  );
  await writeFile(
    path.join(dir, "group/manual.json"),
    JSON.stringify({
      sourceUrl: "https://www.meetup.com/group/events/",
      title: "Manual",
    }),
  );
  const before = await snapshot(dir);
  await assert.rejects(
    writeEventRecords([event("new", { title: "Unrelated" }), event()], dir),
    /Ambiguous existing/,
  );
  assert.deepEqual(await snapshot(dir), before);
});
