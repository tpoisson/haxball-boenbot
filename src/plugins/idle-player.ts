import IChatCommand from "../models/IChatCommand";
import RoomPlugin from "../room/room-plugin";

interface IPlayerActivity {
  date: Date;
}

export class IdlePlayerPlugin extends RoomPlugin {
  private readonly playerLastActivities = new Map<number, IPlayerActivity>();
  private idleTimeout = 7 * 1000;

  public onGameTick(): void {
    for (const [playerId, playerData] of this.playerLastActivities) {
      if (new Date().getTime() - playerData.date.getTime() > this.idleTimeout) {
        const player = this.room.getPlayer(playerId);
        if (player && player.team !== 0) {
          this.playerLastActivities.delete(playerId);
          // this.room.setPlayerTeam(playerId, 0);
          this.room.sendAnnouncement(`😴 ${player.name} is ronpiching`);
        }
      }
    }
  }

  public onPlayerActivity(player: PlayerObject): void {
    if (!this.playerLastActivities.has(player.id)) {
      this.playerLastActivities.set(player.id, {
        date: new Date(),
      });
    }
    this.playerLastActivities.get(player.id)!.date = new Date();
  }

  public onGameOn(): void {
    this.playerLastActivities.clear();
  }

  public onGameOff(): void {
    this.playerLastActivities.clear();
  }

  getChatsCommands(): IChatCommand[] {
    return [];
  }
}
