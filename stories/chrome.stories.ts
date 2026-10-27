import type { Meta, StoryObj } from "@storybook/html-vite";
import { recordNetworkEntry } from "../src/demo/overlay/network-capture.js";
import { showCaption } from "../src/demo/overlay/inpage/caption.js";
import { renderBeforeStep } from "../src/demo/stepper/panel-before.js";
import { overlayStory, targetBox } from "./page.js";

export default { title: "Overlay" } satisfies Meta;
type Story = StoryObj;

const TONES = ["planned", "auto", "info", "warning", "danger", "success", "orange"] as const;

/** Every piece of chrome at once, as a busy demo step shows it. */
export const Everything: Story = overlayStory(async (page) => {
  await recordNetworkEntry(page, { method: "POST", url: "https://registry.test/api/machines", status: 201, ok: true, ms: 84 });
  await recordNetworkEntry(page, { method: "GET", url: "https://registry.test/api/lines?site=2", status: 404, ok: false, ms: 12 });
  await renderBeforeStep(page, {
    index: 2, total: 6, blockName: "fill-machine-name", moduleIndex: 2, justEnteredEpisode: false,
    allNames: ["nav-equipment", "open-add-form", "fill-machine-name", "fill-capacity", "submit-machine"],
    keys: [{ name: "equipment.machine", value: '{"name":"Mixer 2"}' }],
    description: "Types the machine's name from mem.",
    title: "Equipment registry · add a machine", caption: "Name the machine the way the floor knows it", networkTabVisible: true,
  });
  await page.evaluate((box) => {
    window.__wgSetTypingBadge?.(true, "Mixer 2");
    window.__wgSyncTodos?.({ sync: "set", list: [{ text: "Open the registry", done: true }, { text: "Name the machine", current: true }, { text: "Set its capacity" }, { text: "Save" }] });
    window.__wgSyncDevice?.({ sync: "set", device: { preset: "tablet", touchMode: true, viewport: { width: 820, height: 1180 } }, announce: false });
    window.__wgSetZoomBadge?.(1.25, "#story-target");
    window.__wgPositionRing?.(box, "Add the machine", "planned");
  }, targetBox());
});

/** Each highlight tone (ctx.ui.ring(…, { tone })). */
export const RingTones: Story = overlayStory(async (page) => {
  await page.evaluate((tones) => {
    tones.forEach((tone, i) => {
      const box = { x: 80 + (i % 4) * 260, y: 160 + Math.floor(i / 4) * 150, width: 180, height: 44 };
      window.__wgPaintRingAt?.("story-ring-" + tone, "story-label-" + tone, box, tone, tone);
    });
  }, [...TONES]);
});

export const RingSizes: Story = overlayStory(async (page) => {
  await page.evaluate(() => {
    (["sm", "md", "lg"] as const).forEach((size, i) => {
      const box = { x: 80 + i * 300, y: 200, width: 200, height: 48 };
      window.__wgPaintRingAt?.("story-ring-" + size, "story-label-" + size, box, "Size " + size, "planned", { size, weight: size === "lg" ? "bold" : "normal" });
    });
  });
});

export const Caption: Story = overlayStory(async (page) => {
  await page.evaluate(showCaption, "The registry lists every machine on the floor, with its line");
});

export const NetworkTab: Story = overlayStory(async (page) => {
  await page.evaluate(() => { window.__wgNetworkTabVisible = true; });
  for (const [method, url, status, ms] of [
    ["GET", "/api/machines?page=1", 200, 31],
    ["POST", "/api/machines", 201, 84],
    ["PUT", "/api/machines/42", 200, 40],
    ["DELETE", "/api/machines/41", 204, 22],
    ["GET", "/api/lines/9", 404, 12],
  ] as const) {
    await recordNetworkEntry(page, { method, url: "https://registry.test" + url, status, ok: status < 400, ms });
  }
});

export const DeviceToast: Story = overlayStory(async (page) => {
  await page.evaluate(() => window.__wgSyncDevice?.({ sync: "set", device: { preset: "mobile", touchMode: true, viewport: { width: 390, height: 844 } } }));
});

export const Chips: Story = overlayStory(async (page) => {
  await page.evaluate(() => {
    window.__wgSetTypingBadge?.(true, "Mixer 2");
    window.__wgSetZoomBadge?.(1.5, "");
    window.__wgSyncDevice?.({ sync: "set", device: { preset: "mobile", touchMode: true, viewport: { width: 390, height: 844 } }, announce: false });
  });
});
