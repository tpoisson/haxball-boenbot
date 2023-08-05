import { maps } from "../data/maps";
import IChatCommand from "../models/IChatCommand";
import RoomPlugin from "../room/room-plugin";

export type MapTypes = "futsal" | "classic" | "sniper" | "training";

export interface ICustomMap {
  type: MapTypes;
  players: number;
  content: string;
}

export class StadiumPlugin extends RoomPlugin {
  private isTrainingMode = false;
  private currentNbPlayers = 0;

  getChatsCommands(): IChatCommand[] {
    return [
      {
        name: "Futsal mode",
        commands: ["!futsal", "!ft"],
        admin: true,
        method: (msg) => {
          this.changeStadium("futsal");
          return false;
        },
      },
      {
        name: "Training mode",
        commands: ["!training", "!tr"],
        admin: true,
        method: (msg) => {
          this.changeStadium("training");
          return false;
        },
      },
      {
        name: "Sniper mode",
        commands: ["!sniper"],
        admin: true,
        method: (msg) => {
          this.changeStadium("sniper");
          return false;
        },
      },
    ];
  }

  // If there are no admins left in the room give admin to one of the remaining players.
  public override playerListChanged(newPlayer?: PlayerObject): void {
    // Get all players
    const players = this.room.getPlayerList();
    if (players.length === 0) {
      this.room.stopGame();
      return; // No players left, do nothing.
    }
    if (players.length === 1 && this.currentNbPlayers === 0) {
      this.changeStadium("training");
      this.room.setPlayerTeam(players[0].id, 1);
      this.room.startGame();
    }
    if (newPlayer && this.isTrainingMode) {
      this.room.setPlayerTeam(newPlayer.id, 1);
    }

    // Admin
    if (players.find((player) => player.admin) != null) return; // There's an admin left so do nothing.
    this.room.setPlayerAdmin(players[0].id, true); // Give admin to the first non admin player in the list

    this.currentNbPlayers = players.length;
  }

  private changeStadium(type: MapTypes) {
    this.isTrainingMode = type === "training";
    const nbPlayers = this.room.getPlayerList().length;
    const stadium = maps
      .filter((map) => map.type === type && map.players >= nbPlayers)
      .sort((a, b) => b.players - a.players)
      .pop();

    if (stadium) {
      this.room.stopGame();
      this.room.setCustomStadium(stadium!.content);
    }
  }
}
