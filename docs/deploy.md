# Deploy / preview

This site is built with [VitePress](https://vitepress.dev). GitHub Actions builds and deploys it
to Pages on every push to `main`.

## Local preview

From the package root:

```sh
npm run docs:dev      # dev server with hot reload
npm run docs:build    # static build to docs/.vitepress/dist
npm run docs:preview  # serve the built output locally
```

## GitHub Pages (Actions)

1. Workflow: `.github/workflows/pages.yml` runs `npm run docs:build` and uploads
   `docs/.vitepress/dist` on push to `main` (and `workflow_dispatch`).
2. First deploy: the workflow uses `enablement: true` on `configure-pages` to auto-provision
   Pages. If org policy blocks that, set Settings → Pages → Source to **GitHub Actions** once,
   then re-run.
3. Published URL: [https://deviate-dv8.github.io/waygraph/](https://deviate-dv8.github.io/waygraph/)

The site's `base` (`docs/.vitepress/config.mts`) is set to `/waygraph/` to match that project
Pages path.

## What is not on Pages

OpenSpec change folders, Playwright fixtures, and `dist/` stay in the git repo only. Runnable
Sauce Demo source stays at `examples/saucedemo`; the convention walkthrough is on Pages at
[`docs/public/saucedemo/`](/saucedemo/) (a static passthrough - VitePress copies `docs/public/`
straight to the site root, unbuilt).
