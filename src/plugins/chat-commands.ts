import isEqual from "lodash.isequal";
import IChatCommand from "../models/IChatCommand";
import RoomPlugin from "../room/room-plugin";

export class ChatCommandsPlugin extends RoomPlugin {
  getChatsCommands(): IChatCommand[] {
    return [
      {
        name: "Clear bans",
        commands: ["!clearbans"],
        admin: true,
        method: (msg) => {
          this.room.clearBans();
          return false;
        },
      },
      {
        name: "Match - Rematch",
        commands: ["!rematch", "!rm"],
        admin: true,
        method: (msg) => {
          this.room.stopGame();
          const players = this.room.getPlayerList();
          players.forEach((p) => {
            this.room.setPlayerTeam(p.id, p.team === 1 ? 2 : 1);
          });
          this.room.startGame();
          this.room.sendAnnouncement("📢 Rematch game !", undefined, 0xff00ff, "bold", 2);
          return false;
        },
      },
      {
        name: "Match - Reset",
        commands: ["!reset", "!rs"],
        admin: true,
        method: (msg) => {
          this.room.stopGame();
          this.room.startGame();
          this.room.sendAnnouncement("📢 Game reset !", undefined, 0xff00ff, "bold", 2);
          return false;
        },
      },
      {
        name: "Match - Shuffle teams",
        commands: ["!shuffle", "!sf"],
        admin: true,
        method: (msg) => {
          this.room.stopGame();
          const playerIdList = this.room.getPlayerList().map((p) => p.id);
          const originalPlayerIds = [...playerIdList];

          let shuffleValid = false;
          do {
            let currentIndex = playerIdList.length,
              randomIndex;
            while (currentIndex != 0) {
              randomIndex = Math.floor(Math.random() * currentIndex);
              currentIndex--;
              [playerIdList[currentIndex], playerIdList[randomIndex]] = [playerIdList[randomIndex], playerIdList[currentIndex]];
            }

            shuffleValid = playerIdList.length <= 2 || !isEqual(originalPlayerIds, playerIdList);
          } while (!shuffleValid);

          playerIdList.forEach((playerId, index) => this.room.setPlayerTeam(playerId, index % 2 == 0 ? 1 : 2));
          this.room.startGame();
          this.room.sendAnnouncement("📢 Teams shuffled !", undefined, 0xff00ff, "bold", 2);
          return false;
        },
      },
    ];
  }

  public onPlayerJoin(newPlayer: PlayerObject): void {
    this.room.sendAnnouncement("Type !help to list all available commands !", newPlayer.id, 0xff00ff, undefined, 2);
  }
}
