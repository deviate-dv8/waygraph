import { PlayerService } from '#services/player_service'

/** Stops a play still going when the app shuts down: no browser is left behind. */
export default class PlayerProvider {
  async shutdown() {
    new PlayerService().stop()
  }
}
