import IChatCommand from "../models/IChatCommand";
import { PlayerScoreObject } from "./HaxballRoom";

export default abstract class RoomPlugin {
  protected readonly room!: RoomObject;

  constructor(room: RoomObject) {
    this.room = room;
  }
  abstract getChatsCommands(): IChatCommand[];

  public onPositionsReset(): void {}

  public onTeamGoal(scoreHistory: PlayerScoreObject[]): void {}
  public onTeamVictory(scores: ScoresObject): void {}

  public onGameStart(byPlayer: PlayerObject): void {}
  public onGameStop(byPlayer: PlayerObject): void {}
  public onGamePause(byPlayer: PlayerObject): void {}
  public onGameUnpause(byPlayer: PlayerObject): void {}
  public onGameTick(): void {}

  public onPlayerActivity(player: PlayerObject): void {}
  public onPlayerBallKick(byPlayer: PlayerObject): void {}
  public onPlayersBallTouch(byPlayers: PlayerObject[]): void {}
}
