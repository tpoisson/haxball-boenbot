import isEqual from "lodash.isequal";

import { maps } from "../data/maps";
import { registeredUsers } from "../data/users";
import IChatCommand from "../models/IChatCommand";
import { ICurrentGame } from "../models/ICurrentGame";
import { MapTypes } from "../models/ICustomMap";
import { IPlayerStats } from "../models/IPlayer";
import { RegisteredUser } from "../models/RegisteredUser";
import { OffsidePlugin } from "../plugins/off-side";
import RoomPlugin from "./room-plugin";
import { BlinkOnGoalPlugin } from "../plugins/blink-on-goal";
import { IdlePlayerPlugin } from "../plugins/idle-player";
import { PowerShotPlugin } from "../plugins/power-shot";
import { isMatch, pointDistance } from "../utils/common";
import { BallPossession } from "../plugins/ball-possession";
import { TrollAnnouncementPlugin } from "../plugins/troll-announcement";
import { GoalAnnouncementPlugin } from "../plugins/goal-announcement";

export type PlayerScoreObject = {
  scorer: PlayerObject;
  time: number;
  ownGoal: boolean;
  assist?: PlayerObject;
  team: TeamID;
};

// https://github.com/haxball/haxball-issues/wiki/Headless-Host
// https://github.com/haxball/haxball-issues/wiki/Headless-Host-Changelog
export default class HaxballRoom {
  private chatCommands: IChatCommand[] = [
    {
      name: "See all chat commands",
      commands: ["!help"],
      admin: false,
      method: (msg) => {
        this.room.sendAnnouncement(this.chatCommands.map((chatCommand) => `${chatCommand.name} : ${chatCommand.commands.join(", ")}`).join("\n"));
        return false;
      },
    },
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

  private room: RoomObject;
  private currentNbPlayers = 0;

  private isTrainingMode = false;

  private distanceSensitivity = 1.1; // Percentage of distance

  private db: IDBDatabase;

  private currentGame?: ICurrentGame;

  private scoring = new Array<PlayerScoreObject>();

  private roomConfig: { ballRadius?: number; playerRadius?: number } = {};

  private plugins = new Array<RoomPlugin>();

  constructor(db: IDBDatabase) {
    this.db = db;
    this.room = HBInit({
      roomName: "Fish 🐠",
      maxPlayers: 16,
      noPlayer: true,
      password: "bite",
      public: true,
      geo: { code: "fr", lat: 50.6, lon: 3.21 },
    });

    // Plugins
    this.initPlugins();

    this.room.setDefaultStadium("Classic");
    this.room.setScoreLimit(3);
    this.room.setTimeLimit(5);
    // https://haxcolors.com/
    this.room.setTeamColors(1, 45, 0xffffff, [0xe16d54, 0xe18446, 0xe15a31]);
    this.room.setTeamColors(2, 45, 0xffffff, [0x669ce2, 0x548be2, 0x0080ff]);

    // Game Lifecycle
    this.room.onGameStart = (byPlayer) => {
      this.scoring = [];
      this.roomConfig.ballRadius = this.room.getDiscProperties(0).radius;
      this.currentGame = {};
      const player = this.room.getPlayerList().find((p) => p.team > 0);
      if (player) {
        this.roomConfig.playerRadius = this.room.getPlayerDiscProperties(player.id)?.radius;
      }
      this.plugins.forEach((plugin) => plugin.onGameStart(byPlayer));
    };
    this.room.onGameStop = (byPlayer) => {
      this.plugins.forEach((plugin) => plugin.onGameStop(byPlayer));
    };
    this.room.onGamePause = (byPlayer) => {
      this.plugins.forEach((plugin) => plugin.onGamePause(byPlayer));
    };
    this.room.onGameUnpause = (byPlayer) => {
      this.plugins.forEach((plugin) => plugin.onGameUnpause(byPlayer));
    };
    this.room.onGameTick = () => {
      this.plugins.forEach((plugin) => plugin.onGameTick());
      const ballPosition = this.room.getBallPosition();
      const playersTouchingBall = this.room
        .getPlayerList()
        .filter((player) => player.team !== 0 && pointDistance(player.position, ballPosition) < this.getTriggerDistance(player.id));

      if (playersTouchingBall.length === 1) {
        this.currentGame!.playerTouchingBall = playersTouchingBall[0];
      }
      this.plugins.forEach((plugin) => {
        plugin.onPlayersBallTouch(playersTouchingBall);
      });
    };

    // Match LifeCycle
    this.room.onTeamGoal = (team) => {
      const scorer = this.currentGame!.lastBallKicker || this.currentGame!.playerTouchingBall;
      if (scorer) {
        const scores = this.room.getScores();

        const isOwnGoal = scorer.team !== team;
        const assist =
          !isOwnGoal &&
          this.currentGame!.previousBallKicker &&
          this.currentGame!.previousBallKicker.id !== scorer.id &&
          this.currentGame!.previousBallKicker.team === team
            ? this.currentGame!.previousBallKicker
            : undefined;

        const lastestScore = {
          scorer: { ...scorer },
          time: scores.time,
          ownGoal: isOwnGoal,
          assist: assist ? { ...assist } : undefined,
          team,
        };
        this.scoring.push(lastestScore);
      }
      this.plugins.forEach((plugin) => plugin.onTeamGoal(this.scoring));
    };

    this.room.onTeamVictory = (scores) => {
      this.plugins.forEach((plugin) => plugin.onTeamVictory(scores));

      if (isMatch(this.room)) {
        this.scoring.forEach((scoring) => {
          const scorerIsRegistered = registeredUsers.find((p) => p.sessionId === scoring.scorer.id);

          if (scorerIsRegistered) {
            this.storePlayerStats(scorerIsRegistered.id, scoring.ownGoal, false);
          }

          const assistIsRegistered = scoring.assist && registeredUsers.find((p) => p.sessionId === scoring.assist?.id);

          if (assistIsRegistered) {
            this.storePlayerStats(assistIsRegistered.id, false, true);
          }
        });

        const announcements = [];

        // Homme du match
        const playerMatchData = new Map<number, { points: number; name: string; goals: number; assists: number; ownGoals: number }>();
        this.scoring.forEach((scoring) => {
          if (!playerMatchData.has(scoring.scorer.id)) {
            playerMatchData.set(scoring.scorer.id, { points: 0, goals: 0, assists: 0, ownGoals: 0, name: scoring.scorer.name });
          }
          playerMatchData.get(scoring.scorer.id)!.points += 10 * (scoring.ownGoal ? -0.5 : 1);
          playerMatchData.get(scoring.scorer.id)!.goals += scoring.ownGoal ? 0 : 1;
          playerMatchData.get(scoring.scorer.id)!.ownGoals += scoring.ownGoal ? 1 : 0;
          if (scoring.assist) {
            if (!playerMatchData.has(scoring.assist.id)) {
              playerMatchData.set(scoring.assist.id, { points: 0, goals: 0, assists: 0, ownGoals: 0, name: scoring.assist.name });
            }
            playerMatchData.get(scoring.assist.id)!.points += 4;
            playerMatchData.get(scoring.assist.id)!.assists += 1;
          }
        });

        if (playerMatchData.size > 0) {
          const manOfTheMatch = Array.from(playerMatchData.values()).sort((a, b) => b.points - a.points)[0];
          announcements.push(
            `🎖️ Best player : ${manOfTheMatch.name} ! ${manOfTheMatch.goals} goals / ${manOfTheMatch.assists} assists / ${manOfTheMatch.ownGoals} own goals`,
          );
        }

        this.room.sendAnnouncement(announcements.join("\n"), undefined, 0xff00ff, "bold", 2);
      }
    };
    this.room.onPositionsReset = () => {
      this.plugins.forEach((plugin) => plugin.onPositionsReset());
      if (this.currentGame) {
        this.currentGame.playerTouchingBall = undefined;
        this.currentGame.lastBallKicker = undefined;
        this.currentGame.previousBallKicker = undefined;
      }
    };

    // Player LifeCycle
    this.room.onPlayerTeamChange = (changedPlayer, byPlayer) => {
      if (changedPlayer.team != 0) {
        this.roomConfig.playerRadius = this.room.getPlayerDiscProperties(changedPlayer.id)?.radius;
      }
    };
    this.room.onPlayerActivity = (player) => {
      this.plugins.forEach((plugin) => plugin.onPlayerActivity(player));
    };

    this.room.onPlayerJoin = (newPlayer) => {
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
      this.playerListChanged(newPlayer);
    };

    this.room.onPlayerLeave = (leavingPlayer) => {
      const registeredUser = registeredUsers.find((rUser) => leavingPlayer.id === rUser.sessionId);
      if (registeredUser) {
        registeredUser.sessionId = undefined;
      }
      this.playerListChanged();
    };

    this.room.onPlayerBallKick = (player) => {
      this.plugins.forEach((plugin) => plugin.onPlayerBallKick(player));
      if (this.currentGame) {
        this.currentGame.previousBallKicker = this.currentGame.lastBallKicker;
        this.currentGame.lastBallKicker = player;
      }
    };

    this.room.onPlayerChat = (player, msg) => {
      if (msg.startsWith("!")) {
        const command = this.chatCommands.find(
          (chatCommand) => chatCommand.commands.some((command) => msg.startsWith(command)) && (chatCommand.admin ? player.admin : true),
        );
        if (command) {
          return command.method(msg);
        } else {
          this.room.sendChat("Cette commande n'existe pas, noob", player.id);
        }
        return false;
      }
      return true;
    };
  }

  private initPlugins() {
    [
      new OffsidePlugin(this.room),
      new BlinkOnGoalPlugin(this.room),
      new IdlePlayerPlugin(this.room),
      new PowerShotPlugin(this.room),
      new BallPossession(this.room),
      new TrollAnnouncementPlugin(this.room),
      new GoalAnnouncementPlugin(this.room),
    ].forEach((plugin) => {
      this.chatCommands.push(...plugin.getChatsCommands());
      this.plugins.push(plugin);
    });
  }

  private getTriggerDistance(playerId: number) {
    const playerRadius = this.room.getPlayerDiscProperties(playerId).radius;
    return (this.roomConfig.ballRadius! + playerRadius) * this.distanceSensitivity;
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

  // If there are no admins left in the room give admin to one of the remaining players.
  private playerListChanged(newPlayer?: PlayerObject) {
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
