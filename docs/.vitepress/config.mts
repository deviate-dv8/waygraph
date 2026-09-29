import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Waygraph",
  description: "Write browser tests as a graph of small, reusable steps. Built on Playwright.",
  base: "/waygraph/",
  cleanUrls: true,
  lastUpdated: true,
  // Long, hand-written reference doc with plenty of raw <In, Out> generics outside code spans -
  // Vue's template compiler chokes on those as stray HTML. Never rendered as a site page anyway
  // (the original site always linked it straight to GitHub's own blob viewer); exclude it from the
  // build rather than rewrite the whole file to escape every generic.
  srcExclude: ["REFERENCE.md"],
  // public/saucedemo/ and public/proposals/ are a separate static site/plain markdown, copied
  // through as-is (not VitePress pages) - their own relative links resolve fine on their own but
  // read as dead links to VitePress's page-based checker.
  ignoreDeadLinks: [/^\.\.?\//],
  head: [
    ["link", { rel: "icon", href: "/waygraph/favicon.svg" }],
    [
      "link",
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;600;700&display=swap",
      },
    ],
  ],

  themeConfig: {
    logo: "/favicon.svg",
    nav: [
      { text: "Home", link: "/" },
      { text: "Quick start", link: "/quickstart" },
      { text: "Guides", link: "/scaffold" },
      { text: "Reference", link: "https://github.com/deviate-dv8/waygraph/blob/main/docs/REFERENCE.md" },
      { text: "Sauce Demo", link: "/saucedemo/" },
      { text: "npm", link: "https://www.npmjs.com/package/waygraph" },
    ],

    sidebar: [
      {
        text: "Start here",
        items: [
          { text: "Home", link: "/" },
          { text: "Quick start", link: "/quickstart" },
          { text: "What init creates", link: "/scaffold" },
          { text: "The Map layout", link: "/consumer" },
        ],
      },
      {
        text: "Use",
        items: [
          { text: "Run and demo flows", link: "/demo" },
          { text: "Explore with auto", link: "/auto" },
          { text: "Demo narration", link: "/highlights" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "Engine handout", link: "/handout" },
          { text: "Full reference", link: "https://github.com/deviate-dv8/waygraph/blob/main/docs/REFERENCE.md" },
          { text: "Preview / deploy these docs", link: "/deploy" },
        ],
      },
    ],

    socialLinks: [
      { icon: "github", link: "https://github.com/deviate-dv8/waygraph" },
      { icon: "npm", link: "https://www.npmjs.com/package/waygraph" },
    ],

    search: { provider: "local" },

    footer: {
      message: "Requires Node 22+ · @playwright/test is a peer dependency (^1.40) · not v1.0 yet",
      copyright: "MIT Licensed",
    },

    editLink: {
      pattern: "https://github.com/deviate-dv8/waygraph/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
  },
});
