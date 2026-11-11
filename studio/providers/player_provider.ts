import { PlayerService } from '#services/player_service'
import { PlaywrightUiService } from '#services/playwright_ui_service'
import { CommandService } from '#services/command_service'

/** Stops a play still going, Playwright's UI mode and a command, when the app shuts down: no browser is left behind. */
export default class PlayerProvider {
  async shutdown() {
    new PlayerService().stop()
    await new PlaywrightUiService().stop()
    await new CommandService().stop()
  }
}
