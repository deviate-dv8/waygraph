import { PlayerService } from '#services/player_service'
import { PlaywrightUiService } from '#services/playwright_ui_service'

/** Stops a play still going, and Playwright's UI mode, when the app shuts down: no browser is left behind. */
export default class PlayerProvider {
  async shutdown() {
    new PlayerService().stop()
    await new PlaywrightUiService().stop()
  }
}
