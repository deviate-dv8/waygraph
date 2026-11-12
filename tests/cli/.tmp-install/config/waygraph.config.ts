import { defineConfig, openAIVoice } from "waygraph";
export default defineConfig({ demo: { voice: { speaker: openAIVoice() } } });
