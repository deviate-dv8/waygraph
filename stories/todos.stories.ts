import type { Meta, StoryObj } from "@storybook/html-vite";
import { overlayStory } from "./page.js";

export default { title: "Todo dock" } satisfies Meta;
type Story = StoryObj;

const items = (n: number, current: number) =>
  Array.from({ length: n }, (_, i) => ({ id: "t" + i, text: ["Open the registry", "Name the machine", "Set its capacity", "Pick its line", "Save", "Check the list"][i % 6]! + (i >= 6 ? " (" + (i + 1) + ")" : ""), done: i < current, current: i === current }));

const dock = (style: "sequential" | "checklist" | "bullets", n = 5, current = 1) =>
  overlayStory(async (page) => {
    await page.evaluate(
      ([style, list]) => window.__wgSyncTodos?.({ sync: "set", dock: { id: "story", title: "Add a machine", groups: [{ id: "g", style, items: list }] } }),
      [style, items(n, current)] as const,
    );
  });

export const Sequential: Story = dock("sequential");
export const Checklist: Story = dock("checklist", 5, 2);
export const Bullets: Story = dock("bullets", 4, -1);
export const LongListFolds: Story = dock("sequential", 14, 6);
