import IChatCommand from "../models/IChatCommand";
import { PlayerScoreObject } from "./HaxballRoom";

export default abstract class RoomPlugin {
  protected readonly room: RoomObject;

  protected readonly db: IDBDatabase;

  constructor(room: RoomObject, db: IDBDatabase) {
    this.room = room;
    this.db = db;
  }

  abstract getChatsCommands(): IChatCommand[];

  public onPositionsReset(): void {}

  public onTeamGoal(scoreHistory: PlayerScoreObject[]): void {}
  public onTeamVictory(scoreHistory: PlayerScoreObject[]): void {}

  public onGameStart(byPlayer: PlayerObject | null): void {}
  public onGameStop(byPlayer: PlayerObject | null): void {}
  public onGamePause(byPlayer: PlayerObject | null): void {}
  public onGameUnpause(byPlayer: PlayerObject | null): void {}
  public onGameKickoff(byPlayer: PlayerObject): void {}
  public onGameKickoffReset(): void {}
  public onGameTick(): void {}

  public onPlayerJoin(newPlayer: PlayerObject): void {}
  public onPlayerLeave(leavingPlayer: PlayerObject): void {}
  public onPlayerActivity(player: PlayerObject): void {}
  public onPlayerBallKick(byPlayer: PlayerObject): void {}
  public onPlayersBallTouch(byPlayers: PlayerObject[]): void {}
}
