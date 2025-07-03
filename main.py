import json
import os
import re

import requests
from bs4 import BeautifulSoup
from jinja2 import Environment, FileSystemLoader
from markdownify import markdownify as md


def extract_first_event(group_url):
    response = requests.get(group_url)
    soup = BeautifulSoup(response.content, "html.parser")

    # get the first anchor tag named event-card-e-1
    first_event = soup.find("a", {"id": "event-card-e-1"})

    # if first_event is None, return None
    if first_event is None:
        return ""

    # get the href attribute of the first_event
    first_event_url = first_event["href"]
    return first_event_url


def extract_all_events(group_url):
    response = requests.get(group_url)
    soup = BeautifulSoup(response.content, "html.parser")

    all_events = soup.find_all("a", id=re.compile("event-card-e-[0-9]"))

    # get the href attribute of the all the events
    all_event_urls = [e["href"] for e in all_events]

    return all_event_urls


def extract_event_data(url):
    """Extracts event data from a Meetup event page.

    Args:
        url: The URL of the Meetup event page.

    Returns:
        A dictionary containing the event name, date, time, and description.
    """

    # using url remove https://www.meetup.com and assign to variable called meetup_name
    meetup_name = url.split("/")[3]

    response = requests.get(url)
    soup = BeautifulSoup(response.content, "html.parser")

    # Get title of the webpage
    event_name = soup.title.text

    # replace "| Meetup" with empty string
    event_name = event_name.replace(" | Meetup", "")

    # trim whitespace
    event_name = event_name.strip()

    # split the event name by comma
    event_parts = event_name.split(",")

    # get the last element of event_parts
    event_time = event_parts[-1].strip()
    event_date = event_parts[-3].strip()

    # Extract startDate from <script type="application/ld+json">
    start_date = None
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string)
            # If it's a list, iterate through items
            if isinstance(data, list):
                for item in data:
                    if isinstance(item, dict) and "startDate" in item:
                        start_date = item["startDate"]
                        break
            elif isinstance(data, dict) and "startDate" in data:
                start_date = data["startDate"]
                break
        except Exception:
            continue

    # ...existing code...
    event_datetime = start_date  # Use startDate from JSON-LD


    # get href element with id of event-group-link
    event_group_link = soup.find("a", {"id": "event-group-link"})

    # get description of the event
    event_description = soup.find("div", {"class": "break-words"})
    if event_description is not None:
        event_description = md(event_description.prettify(), bullets='-')

    # get the href attribute of the event_group_link
    event_group_link_url = event_group_link["href"]

    print(meetup_name, event_name)

    return {
        "title": event_name,
        "url": url,
        "date": event_date,
        "time": event_time,
        "group_url": event_group_link_url,
        "meetup_name": meetup_name,
        "description": event_description,
        "datetime": event_datetime,
    }


def getMeetupGroupList():
    return [
        "https://www.meetup.com/space-coast-devs/",
        "https://www.meetup.com/spacecoastsec",
        "https://www.meetup.com/melbourne-makerspace-florida-usa/",
        "https://www.meetup.com/melbourne-rhug"
    ]


def renderBlogs(records, template, outputFile):
    # Set up the Jinja2 environment and load the template
    env = Environment(loader=FileSystemLoader("templates"))
    template = env.get_template(template)

    # Render the template with the blog posts
    output = template.render(posts=records)

    # Write the output to a file
    with open(outputFile, "w") as f:
        f.write(output)


if __name__ == "__main__":
    groupLinks = getMeetupGroupList()
    eventData = []
    for groupLink in groupLinks:
        all_event_links = extract_all_events(groupLink)
        for event in all_event_links:
            eventData.append(extract_event_data(event))
    eventData = sorted(eventData, key=lambda x: x["datetime"])
    renderBlogs(eventData, "template.md", "output.md")
