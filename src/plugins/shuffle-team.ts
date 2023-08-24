import isEqual from "lodash.isequal";
import IChatCommand from "../models/IChatCommand";
import RoomPlugin from "../room/room-plugin";

export class ShuffleTeamsPlugins extends RoomPlugin {
  getChatsCommands(): IChatCommand[] {
    return [
      {
        name: "Match - Shuffle teams",
        commands: ["!shuffle", "!sf"],
        admin: true,
        method: (msg) => {
          this.room.stopGame();

          const teamA = this.room.getPlayerList().filter((player) => player.team === 1);
          const teamB = this.room.getPlayerList().filter((player) => player.team === 2);

          if (teamA.length > 0 && teamB.length > 0) {
            const [shuffledTeamA, shuffledTeamB] = this.shuffleTeams(teamA, teamB);
            shuffledTeamA.forEach((shuffledPlayerA) => this.room.setPlayerTeam(shuffledPlayerA.id, 1));
            shuffledTeamB.forEach((shuffledPlayerB) => this.room.setPlayerTeam(shuffledPlayerB.id, 2));
          }
          this.room.startGame();
          this.room.sendAnnouncement("📢 Teams shuffled !", undefined, 0xff00ff, "bold", 2);
          return false;
        },
      },
    ];
  }

  /*
  private shufflePlayers(): void {
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
   
  }*/

  private shuffleTeams(teamA: PlayerObject[], teamB: PlayerObject[]): PlayerObject[][] {
    // Combine the players from both teams into a single array
    const allPlayers = [...teamA, ...teamB];

    // Shuffle the array using the Fisher-Yates (Knuth) Shuffle algorithm
    for (let i = allPlayers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allPlayers[i], allPlayers[j]] = [allPlayers[j], allPlayers[i]];
    }

    // Divide the shuffled array back into two teams
    const middleIndex = Math.floor(allPlayers.length / 2);
    const shuffledTeamA = allPlayers.slice(0, middleIndex);
    const shuffledTeamB = allPlayers.slice(middleIndex);

    // Check if the shuffled teams are equal to the previous teams
    // If they are, shuffle again until they are different
    if (this.teamsAreEqual(shuffledTeamA, teamA) && this.teamsAreEqual(shuffledTeamB, teamB)) {
      return this.shuffleTeams(teamA, teamB);
    }

    return [shuffledTeamA, shuffledTeamB];
  }

  private teamsAreEqual(team1: PlayerObject[], team2: PlayerObject[]): boolean {
    if (team1.length !== team2.length) {
      return false;
    }

    for (let i = 0; i < team1.length; i++) {
      if (team1[i] !== team2[i]) {
        return false;
      }
    }

    return true;
  }
}
