import IChatCommand from "../models/IChatCommand";
import { IPlayerStats } from "../models/IPlayer";
import { PlayerScoreObject } from "../room/HaxballRoom";
import RoomPlugin from "../room/room-plugin";
import { isMatch } from "../utils/common";

export class TrollAnnouncementPlugin extends RoomPlugin {
  private timeout?: number;

  public onTeamGoal(scoreHistory: PlayerScoreObject[]): void {
    if (isMatch(this.room)) {
      const scores = this.room.getScores();
      if ((scores.red === 0 || scores.blue === 0) && (scores.scoreLimit - scores.red === 1 || scores.scoreLimit - scores.blue === 1)) {
        this.timeout = window.setTimeout(() => {
          this.room.sendAnnouncement(`📢 Y'a des ${scores.blue === 0 ? "bleus" : "rouges"} ?`, undefined, 0xff00ff, "bold", 2);
        }, 1000);
      }
    }
  }

  public onGameStop(byPlayer: PlayerObject): void {
    if (this.timeout) {
      window.clearTimeout(this.timeout);
      this.timeout = undefined;
    }
  }

  getChatsCommands(): IChatCommand[] {
    return [];
  }
}
