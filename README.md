# Presentation Timer

A silent, tablet-first presentation timer. The current site is a static
placeholder; timer functionality is not implemented yet.

See [spec.md](./spec.md) for the planned behavior and
[AGENTS.md](./AGENTS.md) for implementation guidelines.

## Local preview

Serve the static site over HTTP, for example with Python 3:

```sh
python3 -m http.server 8000 --directory site
```

Open <http://localhost:8000>. No dependencies, build step, or bundler are required.

## GitHub Pages

The [deployment workflow](./.github/workflows/deploy-pages.yml) publishes only
the contents of [site/](./site/) on pushes to `main`. It can also be run manually
from the repository's Actions tab after the workflow is on the default branch.

In repository **Settings > Pages > Build and deployment**, the source must be
**GitHub Actions**. The workflow uses the built-in `GITHUB_TOKEN` and OpenID
Connect; no personal access token or repository secret is needed.

After a successful deployment, the site is available at
<https://rkondratowicz.github.io/presentation-timer/>.

For changes to the placeholder, check the page over HTTP in a browser, including
light/dark appearance and portrait/landscape layouts, before deploying.
