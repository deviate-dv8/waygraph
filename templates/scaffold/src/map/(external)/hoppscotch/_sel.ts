// Structural selectors (roles, aria-labels), not bare text: waygraph's own demo overlay repeats page text.
export const HoppscotchSel = {
  urlInput: ".cm-content",
  send: "#send",
  methodInput: "input#method",
  /** The request's tab; the response has its own Headers tab, so take the first match. */
  tab: (name: string) => `button.tab[aria-label='${name}'] >> nth=0`,
  menuItem: (name: string) => `button[role=menuitem]:has(:text-is("${name}"))`,
  keyCell: '[placeholder^="Key"]:visible',
  valueCell: '[placeholder^="Value"]:visible',
  contentTypeMenu: "label:text-is('Content Type') + span button",
  bearerToken: '[placeholder^="Your Bearer Token"]',
  authTypeMenu: "label:text-is('Authorization Type') + span button",
  /** The element holding "Status: 201 • Created". */
  status: "*:has(> span.text-secondary:text-is('Status:'))",
  responseHeadersTab: "button.tab[aria-label='Headers'] >> nth=-1",
  responseHeaderCell: "*:has(> span.text-secondary:text-is('Status:')) >> xpath=following::span[contains(@class,'select-all')]",
  responseJsonTab: "button.tab[aria-label='JSON']",
  rawTab: "button.tab[aria-label='Raw']",
  responseEditor: "div.flex-col:has(> div.sticky label:text-is('Response Body')) .cm-content",
  bodyToolbarButton: "div.sticky:has(label:text-is('Raw Request Body')) button",
  bodyLine: ".cm-line",
  editor: ".cm-content",
  visibleEditor: ".cm-content:visible",
  interceptorHeading: "h4:text('Interceptor')",
  extensionInterceptor: 'button:has-text("Browser extension: v")',
} as const;
