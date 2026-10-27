import type { Preview } from "@storybook/html-vite";

const preview: Preview = {
  globalTypes: {
    appearance: {
      description: "Light or dark, as the viewer's macOS setting would pick",
      toolbar: { title: "Appearance", icon: "contrast", items: ["light", "dark"], dynamicTitle: true },
    },
  },
  initialGlobals: { appearance: "light" },
  parameters: { layout: "fullscreen", controls: { disable: true }, actions: { disable: true } },
};
export default preview;
