import IChatCommand from "../models/IChatCommand";
import { PlayerScoreObject } from "../room/HaxballRoom";
import RoomPlugin from "../room/room-plugin";

export class BallPossession extends RoomPlugin {
  private possessions?: { player: PlayerObject; ticks: number }[];

  public onGameStart(byPlayer: PlayerObject): void {
    this.possessions = [];
  }

  public onPlayersBallTouch(byPlayers: PlayerObject[]): void {
    if (byPlayers.length === 1) {
      const player = byPlayers[0];
      let possession = this.possessions?.find((possession) => possession.player.id === player.id);
      if (!possession) {
        possession = { player: { ...player }, ticks: 0 };
        this.possessions?.push(possession);
      }
      possession.ticks += 1;
    }
  }

  public onTeamVictory(scoreHistory: PlayerScoreObject[]): void {
    const possessionByTeams = this.possessions?.reduce(
      (result, current) => {
        const team = current.player.team;
        const bite = {
          ...result,
        };
        bite[team] += current.ticks;
        bite.total += current.ticks;
        return bite;
      },
      { "0": 0, "1": 0, "2": 0, total: 0 },
    );
    if (possessionByTeams) {
      this.room.sendAnnouncement(
        `🧮 Possession - 🟥 Rouge ${((possessionByTeams["1"] / possessionByTeams.total) * 100).toFixed(2)} % / 🟦 Bleu ${(
          (possessionByTeams["2"] / possessionByTeams.total) *
          100
        ).toFixed(2)} %`,
        undefined,
        0xff00ff,
        "bold",
        0,
      );
    }
  }

  getChatsCommands(): IChatCommand[] {
    return [];
  }
}
