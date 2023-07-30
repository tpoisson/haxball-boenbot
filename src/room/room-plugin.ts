import IChatCommand from "../models/IChatCommand";

export default abstract class RoomPlugin {
  protected readonly room!: RoomObject;

  constructor(room: RoomObject) {
    this.room = room;
  }
  public getChatsCommands(): IChatCommand[] {
    return [];
  }

  public onTeamGoal(team: TeamID): void {}
  public onTeamVictory(scores: ScoresObject): void {}
  public onGameStop(byPlayer: PlayerObject): void {}
  public onGamePause(byPlayer: PlayerObject): void {}
  public onPlayerBallKick(byPlayer: PlayerObject): void {}
  public onPlayersBallTouch(byPlayers: PlayerObject[]): void {}
}
