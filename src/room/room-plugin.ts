import IChatCommand from "../models/IChatCommand";

export default abstract class RoomPlugin {
  protected readonly room!: RoomObject;

  constructor(room: RoomObject) {
    this.room = room;
  }
  abstract getChatsCommands(): IChatCommand[];

  public onPositionsReset(): void {}
  public onTeamGoal(team: TeamID): void {}
  public onTeamVictory(scores: ScoresObject): void {}
  public onGameStop(byPlayer: PlayerObject): void {}
  public onGamePause(byPlayer: PlayerObject): void {}
  public onPlayerBallKick(byPlayer: PlayerObject): void {}
  public onPlayersBallTouch(byPlayers: PlayerObject[]): void {}
}
