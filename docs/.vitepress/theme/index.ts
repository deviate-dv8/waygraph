// The default theme, plus: diagrams are drawn in a handwritten font (Kalam), and Mermaid measures labels in the font it
// draws with. Once the font has loaded, an attribute change on <html> makes every diagram redraw (the mermaid plugin
// re-renders on any <html> attribute change), so no label is measured in a fallback font and clipped.
import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import "./style.css";

export default {
  extends: DefaultTheme,
  enhanceApp() {
    if (typeof document === "undefined") return;
    void document.fonts.load('16px "Kalam"').then(() => {
      document.documentElement.dataset.diagramFont = "ready";
    });
  },
} satisfies Theme;
