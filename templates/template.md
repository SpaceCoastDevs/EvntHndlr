# Space Coast Tech Meetups
{% for post in posts %}
- [{{ post.title }}]({{ post.url }}) via [{{ post.meetup_name }}]({{ post.group_url }})

  {{ post.description }}

{% endfor %}