import IChatCommand from "../models/IChatCommand";
import RoomPlugin from "../room/room-plugin";
import { isMatch } from "../utils/common";
import { registeredUsers } from "../data/users";
import { IPlayerStats } from "../models/IPlayer";
import { RegisteredUser } from "../models/RegisteredUser";
import { PlayerScoreObject } from "../room/HaxballRoom";

export class PlayerStatsPlugin extends RoomPlugin {
  getChatsCommands(): IChatCommand[] {
    return [
      {
        name: "View rankings",
        commands: ["!top"],
        admin: false,
        method: (msg) => {
          const bite = this.db.transaction(["stats"], "readonly").objectStore("stats").getAll();
          bite.onsuccess = () => {
            console.log(bite.result);
            const stats = bite.result as IPlayerStats[];
            const messages: string[] = stats
              .sort((a, b) => (b.nbGoals !== a.nbGoals ? b.nbGoals - a.nbGoals : a.nbOwnGoals - b.nbOwnGoals))
              .map(
                (playerStats, index) =>
                  `${(index < 3 && ["🥇", "🥈", "🥉"][index]) || "💩"} ${registeredUsers.find((player) => player.id === playerStats.playerId)
                    ?.name} - Buts: ${playerStats.nbGoals} / Assist : ${playerStats.nbAssists} / CSC: ${playerStats.nbOwnGoals}`,
              );
            this.room.sendAnnouncement(messages.join("\n"));
          };
          return false;
        },
      },
    ];
  }
  public onTeamVictory(scores: PlayerScoreObject[]): void {
    if (isMatch(this.room)) {
      scores.forEach((scoring) => {
        const scorerIsRegistered = registeredUsers.find((p) => p.sessionId === scoring.scorer.id);

        if (scorerIsRegistered) {
          this.storePlayerStats(scorerIsRegistered.id, scoring.ownGoal, false);
        }

        const assistIsRegistered = scoring.assist && registeredUsers.find((p) => p.sessionId === scoring.assist?.id);

        if (assistIsRegistered) {
          this.storePlayerStats(assistIsRegistered.id, false, true);
        }
      });
    }
  }

  public onPlayerJoin(newPlayer: PlayerObject): void {
    const playerList = this.room.getPlayerList();
    const connectedPublicIds = registeredUsers
      .filter((rUser) => playerList.find((p) => p.id !== newPlayer.id && p.id === rUser.sessionId))
      .flatMap((rUser) => rUser.publicIds);

    if (connectedPublicIds.includes(newPlayer.auth)) {
      this.room.kickPlayer(newPlayer.id, "🍖 Tentative de jambonnage avec une double connexion ?", false);
      return;
    }

    // player.auth property is only set in the RoomObject.onPlayerJoin event.
    const registeredUser =
      registeredUsers.find((p) => p.publicIds.includes(newPlayer.auth)) || registeredUsers.find((p) => p.name === newPlayer.name);
    if (registeredUser) {
      registeredUser.sessionId = newPlayer.id;
      if (registeredUser.superAdmin) {
        this.room.setPlayerAdmin(newPlayer.id, true);
      }
    }

    const greetingMessage = registeredUser ? `✅ ${this.getGreeting(registeredUser)}` : `Bienvenue ${newPlayer.name} !`;
    this.room.sendAnnouncement(greetingMessage, undefined, 0xff00ff, "bold", 0);
  }

  public onPlayerLeave(leavingPlayer: PlayerObject): void {
    const registeredUser = registeredUsers.find((rUser) => leavingPlayer.id === rUser.sessionId);
    if (registeredUser) {
      registeredUser.sessionId = undefined;
    }
  }
  private storePlayerStats(registeredUserId: string, isOwnGoal: boolean, isAssist: boolean) {
    const objectStore = this.db.transaction(["stats"], "readwrite").objectStore("stats");
    const statsRequest = objectStore.get(registeredUserId);

    statsRequest.onsuccess = () => {
      let playerStats = statsRequest.result as IPlayerStats | undefined;
      if (!playerStats) {
        playerStats = {
          playerId: registeredUserId,
          nbGoals: 0,
          nbOwnGoals: 0,
          nbAssists: 0,
        };
      }
      if (isAssist) {
        playerStats.nbAssists += 1;
      } else {
        if (isOwnGoal) {
          playerStats.nbOwnGoals += 1;
        } else {
          playerStats.nbGoals += 1;
        }
      }
      objectStore.put(playerStats, registeredUserId);
    };
  }

  private getGreeting(player: RegisteredUser) {
    return player.greetings[Math.floor(Math.random() * player.greetings.length)];
  }
}
