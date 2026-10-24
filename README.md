# Presentation Timer

Deployed app: <https://rkondratowicz.github.io/presentation-timer/>

A silent, tablet-first presentation timer with configurable warnings, pause and
resume, overtime tracking, and light, dark, or system themes. Preferences and
session recovery are stored in the browser; there is no account or backend.

## Run locally

```sh
python3 -m http.server 8000 --directory site
```

Open <http://localhost:8000>. The app has no dependencies or build step. Serve
it over HTTPS in production.

## Project documentation

See [docs/development.md](./docs/development.md) for implementation guidance,
supported behavior, deployment details, and the manual browser-validation
checklist.
