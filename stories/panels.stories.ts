import type { Meta, StoryObj } from "@storybook/html-vite";
import { renderBeforeStep } from "../src/demo/stepper/panel-before.js";
import { renderAfterStep } from "../src/demo/stepper/panel-after.js";
import { presentFailPanel } from "../src/demo/stepper/step-panels.js";
import { presentSlides } from "../src/demo/stepper/slides.js";
import { showOutcome, tickOutcome } from "../src/demo/overlay/inpage/outcome.js";
import { showFinish } from "../src/demo/overlay/inpage/finish.js";
import { checkpoint } from "../src/engine/checkpoint/checkpoint.js";
import { MemPage } from "../src/engine/mem/mem.js";
import { overlayStory } from "./page.js";

export default { title: "Step panel" } satisfies Meta;
type Story = StoryObj;

const where = {
  index: 2,
  total: 6,
  blockName: "fill-machine-name",
  allNames: ["nav-equipment", "open-add-form", "fill-machine-name", "fill-capacity", "submit-machine", "assert-listed"],
  moduleIndex: 2,
  title: "Equipment registry · add a machine",
};
const episodes = {
  allEpisodes: [
    { episodeNumber: 1, episodeTitle: "Sign in" },
    { episodeNumber: 2, episodeTitle: "Add a machine" },
    { episodeNumber: 3, episodeTitle: "Clean up" },
  ],
  episodeNumber: 2,
};
const pace = { paceBadge: "0.5x", paceLabel: "fast · 225ms gates", paceKind: "fast" };
const never = () => new Promise<Record<string, string>>(() => undefined);

export const BeforeAStep: Story = overlayStory(async (page) => {
  await renderBeforeStep(page, {
    ...where,
    description: "Types the machine's name from mem into the add form.",
    expects: ["The toast says the machine was saved.", "equipment.status = \"Operational\""],
    keys: [{ name: "equipment.machine", value: '{"name":"Mixer 2","capacity":1200,"line":"L3"}' }],
    justEnteredEpisode: false,
  });
});

export const WithEpisodesAndPace: Story = overlayStory(async (page) => {
  await renderBeforeStep(page, { ...where, ...episodes, ...pace, keys: [], description: "", expects: [], justEnteredEpisode: true });
});

export const AfterAStep: Story = overlayStory(async (page) => {
  await renderAfterStep(page, {
    ...where,
    ...pace,
    result: checkpoint("MachineFormFilled"),
    resultTag: '{"__state":"MachineFormFilled"}',
    highlights: [],
    isLast: false,
    read: { machineForm: { name: "Mixer 2", capacity: 1200, line: "L3", error: null }, header: { title: "Add equipment", user: "planner@plant.test" } },
  });
  // Open the disclosure so the story shows it.
  await page.evaluate(() => document.getElementById("wg-root")?.shadowRoot?.querySelector("details.wg-read")?.setAttribute("open", ""));
});

export const LastStep: Story = overlayStory(async (page) => {
  await renderAfterStep(page, { ...where, index: 5, moduleIndex: 5, blockName: "assert-listed", result: checkpoint("MachineListed"), resultTag: '{"__state":"MachineListed"}', highlights: [], isLast: true });
});

const failed = (expectedFailureReason?: string) =>
  overlayStory(async (page) => {
    void presentFailPanel(page, {
      ...where,
      ...episodes,
      block: { name: where.blockName, instruction: { act: async () => undefined, resolve: () => checkpoint("X") } } as never,
      error: new Error("boom"),
      message:
        'trait "text-equals(.toast, "Saved")" failed after "submit-machine": wanted "Saved" in .toast; saw "Name is required" (on /equipment/new "Add equipment")',
      expectedFailureReason,
      gate: never,
      mem: new MemPage(),
    });
    await new Promise((r) => setTimeout(r, 150));
  });

export const Failed: Story = failed();
export const FailedAsExpected: Story = failed("A machine without a name is rejected: the form says so.");

export const Slide: Story = overlayStory(async (page) => {
  void presentSlides(page, [{ caption: "The registry lists every machine on the floor", detail: "Each row is one machine, with its line and when it was last serviced." }, { caption: "Second slide" }], {
    title: where.title,
    blockName: "assert-listed",
    episodeNumber: 2,
    episodeTitle: "Add a machine",
  });
  await new Promise((r) => setTimeout(r, 150));
});

export const Collapsed: Story = overlayStory(async (page) => {
  await renderBeforeStep(page, { ...where, ...pace, keys: [], description: "", expects: [], justEnteredEpisode: false, forceCollapsed: true, fastForward: true });
});

/** After a step: what the scenario expected (one held, one didn't) and what the page now shows that changed. */
export const Outcome: Story = overlayStory(async (page) => {
  await page.evaluate(showOutcome, {
    expects: [
      { text: "The toast says the machine was saved.", ok: true },
      { text: "The registry lists the machine as Operational", ok: false, saw: '"Down"' },
    ],
    changes: [
      { key: "equipment.count", from: "12", to: "13" },
      { key: "equipment.lastAdded", from: "Mixer 1", to: "Mixer 2" },
    ],
    moreChanges: 0,
  });
  await page.evaluate(tickOutcome, 0);
  await page.evaluate(tickOutcome, 1);
  await new Promise((r) => setTimeout(r, 400));
});

/** The demo's last word: every step played. */
export const Finished: Story = overlayStory(async (page) => {
  await page.evaluate(showFinish, { status: "passed" as const, title: "Equipment registry · add a machine", summary: "6 steps · 12.4 s" });
  await new Promise((r) => setTimeout(r, 450));
});

/** ...or it stopped on a failure, saying where. */
export const Stopped: Story = overlayStory(async (page) => {
  await page.evaluate(showFinish, {
    status: "stopped" as const,
    title: "Equipment registry · add a machine",
    summary: "4 steps · 9.8 s",
    detail: 'Step 4, submit-machine: wanted "Saved" in .toast; saw "Name is required"',
  });
  await new Promise((r) => setTimeout(r, 450));
});
