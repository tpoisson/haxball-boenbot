import IChatCommand from "../models/IChatCommand";
import { PlayerScoreObject } from "../room/HaxballRoom";
import RoomPlugin from "../room/room-plugin";

export class BlinkOnGoalPlugin extends RoomPlugin {
  private blinkInterval?: number;

  getChatsCommands(): IChatCommand[] {
    return [];
  }

  public onPositionsReset(): void {
    this.clearBlink();
    this.resetPlayerAvatar();
  }

  public onGameStop(byPlayer: PlayerObject): void {
    this.clearBlink();
    this.resetPlayerAvatar();
  }

  public onTeamGoal(scoreHistory: PlayerScoreObject[]): void {
    const scores = this.room.getScores();
    const avatar = scores.blue === scores.scoreLimit || scores.red === scores.scoreLimit ? "🏆" : "⚽";
    this.blinkTeamAvatar(scoreHistory.at(scoreHistory.length - 1)!.team, avatar);
  }

  private resetPlayerAvatar() {
    this.room.getPlayerList().forEach((p) => this.overrideSetPlayerAvatar(p.id, null));
  }

  private blinkTeamAvatar(team: TeamID, avatar: string) {
    let i = 0;
    this.clearBlink();
    const playerTeam = this.room.getPlayerList().filter((p) => p.team === team);

    const blinkFunction = () => {
      playerTeam.forEach((p) => this.overrideSetPlayerAvatar(p.id, i % 2 === 0 ? avatar : null));
      i += 1;
    };
    this.blinkInterval = window.setInterval(blinkFunction, 200);
    blinkFunction();
  }

  private overrideSetPlayerAvatar(playerId: number, avatar: string | null) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore: Unreachable code error
    this.room.setPlayerAvatar(playerId, avatar);
  }

  private clearBlink() {
    if (this.blinkInterval) {
      window.clearInterval(this.blinkInterval);
      this.blinkInterval = undefined;
    }
  }
}
