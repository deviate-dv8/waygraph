// What the overlay's code imports from @playwright/test at runtime, for Storybook: stories never launch a browser, so
// the launchers are empty and errors are plain classes (engine/page-gone.ts tells a timeout apart by class).
class TimeoutError extends Error {}
export const errors = { TimeoutError };
const notInStorybook = { launch: () => Promise.reject(new Error("no browser launching in Storybook")) };
export const chromium = notInStorybook;
export const firefox = notInStorybook;
export const webkit = notInStorybook;
