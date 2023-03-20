// https://github.com/haxball/haxball-issues/wiki/Headless-Host
import isEqual from "lodash.isequal";

import { maps } from "../data/maps";
import { registeredUsers } from "../data/users";
import IChatCommand from "../models/IChatCommand";
import { ICurrentGame } from "../models/ICurrentGame";
import { MapTypes } from "../models/ICustomMap";
import { IPlayerActivity, IPlayerStats } from "../models/IPlayer";
import { RegisteredUser } from "../models/RegisteredUser";

export default class HaxballRoom {
  private powerShotConfig = {
    enabled: false,
    timeout: 60 * 2, // This means 2 seconds.
    powerCoefficient: 2, // Original ball kick speed would be multiplied by this number when power shot is activated.
    distanceSensitivity: 1.1, // Percentage of distance
  };
  private chatCommands: IChatCommand[] = [
    {
      name: "Voir toutes les commandes",
      commands: ["!help"],
      admin: false,
      method: (msg) => {
        this.room.sendAnnouncement(this.chatCommands.map((chatCommand) => `${chatCommand.name} : ${chatCommand.commands.join(", ")}`).join("\n"));
        return true;
      },
    },
    {
      name: "Activer/Désactiver le powershot",
      commands: ["!powershot", "!ps"],
      admin: true,
      method: (msg) => {
        this.powerShotConfig.enabled = !this.powerShotConfig.enabled;
        this.room.sendAnnouncement(`🚀 - ${this.powerShotConfig.enabled ? "Powershot activé ✅" : "Powershot désactivé ❌"} `);
        return true;
      },
    },
    {
      name: "Passer en mode futsal",
      commands: ["!futsal", "!ft"],
      admin: true,
      method: (msg) => {
        this.changeStadium("futsal");
        return true;
      },
    },
    {
      name: "Passer en mode entrainement",
      commands: ["!training", "!tr"],
      admin: true,
      method: (msg) => {
        this.changeStadium("training");
        return true;
      },
    },
    {
      name: "Passer en mode sniper",
      commands: ["!sniper"],
      admin: true,
      method: (msg) => {
        this.changeStadium("sniper");
        return true;
      },
    },
    {
      name: "Match - Revanche",
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
        return true;
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
        return true;
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
        return true;
      },
    },
    {
      name: "Voir le classement",
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
                `${(index < 3 && ["🥇", "🥈", "🥉"][index]) || "💩"} ${
                  registeredUsers.find((player) => player.id === playerStats.playerId)?.name
                } - Buts: ${playerStats.nbGoals} / Assist : ${playerStats.nbAssists} / CSC: ${playerStats.nbOwnGoals}`,
            );
          this.room.sendAnnouncement(messages.join("\n"));
        };
        return true;
      },
    },
  ];

  private playerLastActivities = new Map<number, IPlayerActivity>();
  private idleTimeout = 7 * 1000;

  private room: RoomObject;
  private currentNbPlayers = 0;

  private isTrainingMode = false;

  private db: IDBDatabase;

  private currentGame?: ICurrentGame;

  private roomConfig: { ballRadius?: number; playerRadius?: number } = {};

  private blinkInterval?: number;

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
    this.room.setDefaultStadium("Classic");
    this.room.setScoreLimit(3);
    this.room.setTimeLimit(5);
    // https://haxcolors.com/
    this.room.setTeamColors(1, 45, 0xffffff, [0xe16d54, 0xe18446, 0xe15a31]);
    this.room.setTeamColors(2, 45, 0xffffff, [0x669ce2, 0x548be2, 0x0080ff]);

    // Game Lifecycle
    this.room.onGameStart = (byPlayer) => {
      this.roomConfig.ballRadius = this.room.getDiscProperties(0).radius;

      const player = this.room.getPlayerList().find((p) => p.team > 0);
      if (player) {
        this.roomConfig.playerRadius = this.room.getPlayerDiscProperties(player.id)?.radius;
      }

      this.playerLastActivities.clear();
      this.currentGame = {
        ballColor: this.room.getDiscProperties(0).color,
        isGameTime: true,
        timePlayerBallTouch: 0,
        powerShotActive: false,
        scoring: [],
        startTime: new Date(),
        hasKickedOff: false,
        possessions: [],
      };
    };
    this.room.onGameStop = (byPlayer) => {
      this.clearBlink();
      this.resetPlayerAvatar();
      this.currentGame!.isGameTime = false;
    };
    this.room.onGamePause = (byPlayer) => {
      this.currentGame!.isGameTime = false;
    };
    this.room.onGameUnpause = (byPlayer) => {
      this.currentGame!.isGameTime = true;
      this.playerLastActivities.clear();
    };
    this.room.onGameTick = () => {
      if (this.currentGame?.isGameTime && !this.isTrainingMode) {
        for (const [playerId, playerData] of this.playerLastActivities) {
          if (new Date().getTime() - playerData.date.getTime() > this.idleTimeout) {
            const player = this.room.getPlayer(playerId);
            if (player && player.team !== 0) {
              this.playerLastActivities.delete(playerId);
              // this.room.setPlayerTeam(playerId, 0);
              this.room.sendAnnouncement(`😴 ${player.name} s'est assoupi`);
            }
          }
        }
      }

      if (this.currentGame?.isGameTime && this.room.getScores() && this.room.getPlayerList().some((p) => p.team != 0)) {
        if (this.currentGame?.playerTouchingBall && this.powerShotConfig.enabled && this.currentGame?.hasKickedOff === true) {
          this.checkPowerShot();
        }
        this.setLastBallToucher();
      }
    };

    // Match LifeCycle
    this.room.onTeamGoal = (team) => {
      const scores = this.room.getScores();
      if (this.currentGame) {
        this.currentGame.isGameTime = false;
        const scorer = this.currentGame.lastBallKicker || this.currentGame.playerTouchingBall;

        if (scorer) {
          const isOwnGoal = scorer.team !== team;
          const assist =
            !isOwnGoal &&
            this.currentGame.previousBallKicker &&
            this.currentGame.previousBallKicker.id !== scorer.id &&
            this.currentGame.previousBallKicker.team === team
              ? this.currentGame.previousBallKicker
              : undefined;

          this.currentGame.scoring.push({
            scorer: { ...scorer },
            time: scores.time,
            ownGoal: isOwnGoal,
            assist: assist ? { ...assist } : undefined,
          });
          const announcements = [];
          if (isOwnGoal) {
            announcements.push(`⚽🚨 Magnifique CSC, GG ${scorer.name} !`);
          } else {
            const allScorerGoals = this.currentGame.scoring.filter((scoring) => scoring.scorer.id === scorer.id && !scoring.ownGoal);
            if (allScorerGoals.length === 2) {
              announcements.push(`⚽ Doublé de ${scorer.name} !`);
            } else if (allScorerGoals.length === 3) {
              announcements.push(`⚽ Triplé de ${scorer.name} !`);
            } else {
              announcements.push(`⚽ But de ${scorer.name} !`);
            }
          }
          if (assist) {
            announcements.push(`🏃🏻 Sur une passe décisive de ${assist.name} !`);
          }
          this.room.sendAnnouncement(announcements.join("\n"), undefined, undefined, "bold", 2);
        }
      }

      const avatar = scores.blue === scores.scoreLimit || scores.red === scores.scoreLimit ? "🏆" : "⚽";
      this.blinkTeamAvatar(team, avatar);

      if (this.isMatch()) {
        if ((scores.red === 0 || scores.blue === 0) && (scores.scoreLimit - scores.red === 1 || scores.scoreLimit - scores.blue === 1)) {
          window.setTimeout(() => {
            this.room.sendAnnouncement(`📢 Y'a des ${scores.blue === 0 ? "bleus" : "rouges"} ?`, undefined, 0xff00ff, "bold", 2);
          }, 1000);
        }
      }
    };
    this.room.onTeamVictory = (scores) => {
      if (this.currentGame) {
        this.currentGame.isGameTime = false;
        this.currentGame.endTime = new Date();
      }

      if (this.isMatch()) {
        this.currentGame?.scoring.forEach((scoring) => {
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

        // Possession
        const possessionByTeams = this.currentGame?.possessions.reduce(
          (result, current) => {
            const team = current.player.team;
            const bite = {
              ...result,
            };
            bite[team] += current.ticks;
            bite.total += current.ticks;
            return bite;
          },
          { "0": 0, "1": 0, "2": 0, total: 0 },
        );
        console.log(possessionByTeams);
        if (possessionByTeams) {
          announcements.push(
            `🧮 Possession - 🟥 Rouge ${((possessionByTeams["1"] / possessionByTeams.total) * 100).toFixed(2)} % / 🟦 Bleu ${(
              (possessionByTeams["2"] / possessionByTeams.total) *
              100
            ).toFixed(2)} %`,
          );
        }

        // Homme du match
        const playerMatchData = new Map<number, { points: number; name: string; goals: number; assists: number; ownGoals: number }>();
        this.currentGame?.scoring.forEach((scoring) => {
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
            `🎖️ Homme du match : ${manOfTheMatch.name} ! Avec ${manOfTheMatch.goals} buts / ${manOfTheMatch.assists} passes décivises / ${manOfTheMatch.ownGoals} CSC`,
          );
        }

        // Si le slip d'une équipe a été arraché
        if (scores.blue === 0 || scores.red === 0) {
          announcements.push("🍆 Mais c'est une pétée ?");
        }
        this.room.sendAnnouncement(announcements.join("\n"), undefined, 0xff00ff, "bold", 2);
      }
    };
    this.room.onPositionsReset = () => {
      if (this.currentGame) {
        this.currentGame.isGameTime = true;
        this.currentGame.playerTouchingBall = undefined;
        this.currentGame.lastBallKicker = undefined;
        this.currentGame.previousBallKicker = undefined;
        this.currentGame.hasKickedOff = false;
      }
      this.clearBlink();
      this.resetPlayerAvatar();
      this.playerLastActivities.clear();
    };

    // Player LifeCycle
    this.room.onPlayerTeamChange = (changedPlayer, byPlayer) => {
      if (changedPlayer.team != 0) {
        this.roomConfig.playerRadius = this.room.getPlayerDiscProperties(changedPlayer.id)?.radius;
      }
    };
    this.room.onPlayerActivity = (player) => {
      if (!this.playerLastActivities.has(player.id)) {
        this.playerLastActivities.set(player.id, {
          date: new Date(),
        });
      }
      this.playerLastActivities.get(player.id)!.date = new Date();
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
      if (this.currentGame) {
        if (this.currentGame.hasKickedOff === false) {
          this.currentGame.hasKickedOff = true;
        }
        if (this.currentGame.playerTouchingBall?.id === player.id && this.currentGame.powerShotActive) {
          this.room.setDiscProperties(0, {
            xspeed: this.powerShotConfig.powerCoefficient * this.room.getDiscProperties(0).xspeed,
            yspeed: this.powerShotConfig.powerCoefficient * this.room.getDiscProperties(0).yspeed,
          });
          this.currentGame.powerShotActive = false;
        }
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

  private resetPlayerAvatar() {
    this.room.getPlayerList().forEach((p) => this.overrideSetPlayerAvatar(p.id, null));
  }

  private getTriggerDistance(playerId: number) {
    const playerRadius = this.room.getPlayerDiscProperties(playerId).radius;
    return (this.roomConfig.ballRadius! + playerRadius) * this.powerShotConfig.distanceSensitivity;
  }

  private setLastBallToucher() {
    if (!this.currentGame) {
      return;
    }
    const ballPosition = this.room.getBallPosition();
    const playersTouchingBall = this.room
      .getPlayerList()
      .filter((player) => player.team !== 0 && this.pointDistance(player.position, ballPosition) < this.getTriggerDistance(player.id));

    if (playersTouchingBall.length === 0) {
      this.currentGame.powerShotActive = false;
      if (this.currentGame.playerTouchingBall) {
        this.room.setDiscProperties(0, { color: this.currentGame.ballColor });
        this.currentGame.playerTouchingBall = undefined;
      }
    } else if (playersTouchingBall.length === 1) {
      const player = playersTouchingBall[0];
      if (this.currentGame.playerTouchingBall?.id !== player.id) {
        this.currentGame.powerShotActive = false;
        this.currentGame.playerTouchingBall = player;
      }
      let possession = this.currentGame.possessions.find((possession) => possession.player.id === player.id);
      if (!possession) {
        possession = { player: { ...player }, ticks: 0 };
        this.currentGame.possessions.push(possession);
      }
      possession.ticks += 1;
    } else {
      if (this.currentGame) {
        const teamTouchingBall = playersTouchingBall[0].team;

        if (playersTouchingBall.every((player) => player.team === teamTouchingBall)) {
          if (!this.currentGame.powerShotActive) {
            this.currentGame.powerShotActive = true;
            this.room.setDiscProperties(0, { color: 0xff00ff });
            this.room.sendAnnouncement(`TIR DE L'AIGLE DISPO 🚀⚽ !`, undefined, 0x00ff00, "italic", 2);
          }
        } else {
          this.currentGame.powerShotActive = false;
          if (this.currentGame.playerTouchingBall) {
            this.room.setDiscProperties(0, { color: this.currentGame.ballColor });
            this.currentGame.playerTouchingBall = undefined;
          }
        }
      }
    }
  }

  private pointDistance(p1: { x: number; y: number }, p2: { x: number; y: number }) {
    const d1 = p1.x - p2.x;
    const d2 = p1.y - p2.y;
    return Math.sqrt(d1 * d1 + d2 * d2);
  }

  private checkPowerShot() {
    if (!this.currentGame) {
      return;
    }

    const playerTouchingBallId = this.currentGame?.playerTouchingBall?.id;
    const getPlayerDiscProperties = playerTouchingBallId && this.room.getPlayerDiscProperties(playerTouchingBallId);

    if (
      playerTouchingBallId &&
      getPlayerDiscProperties &&
      this.pointDistance(getPlayerDiscProperties, this.room.getDiscProperties(0)) < this.getTriggerDistance(playerTouchingBallId)
    ) {
      this.currentGame.timePlayerBallTouch += 1;
      const coeff = 400;
      this.room.setPlayerDiscProperties(playerTouchingBallId, {
        radius: this.roomConfig.playerRadius! * ((coeff + this.currentGame.timePlayerBallTouch) / coeff),
      });
      if (this.currentGame.timePlayerBallTouch < this.powerShotConfig.timeout) {
        this.room.setDiscProperties(0, { color: 0x00ff00 });
      }
      if (this.currentGame.timePlayerBallTouch === this.powerShotConfig.timeout) {
        this.room.setDiscProperties(0, { color: 0xff00ff });
        this.room.sendAnnouncement(
          `${this.currentGame?.playerTouchingBall?.name} peut envoyer une grosse boulette 🚀⚽ !`,
          undefined,
          0x00ff00,
          "italic",
          2,
        ); //Power shot is activated when the player touches to the ball for 3 seconds long.
      }
      if (this.currentGame.timePlayerBallTouch >= this.powerShotConfig.timeout) {
        this.currentGame.powerShotActive = true;
      }
    } else {
      if (this.currentGame.timePlayerBallTouch != 0) {
        this.currentGame.timePlayerBallTouch = 0;
      }
    }
  }

  private clearBlink() {
    if (this.blinkInterval) {
      window.clearInterval(this.blinkInterval);
      this.blinkInterval = undefined;
    }
  }

  private blinkTeamAvatar(team: 0 | 1 | 2, avatar: string) {
    let i = 0;
    this.clearBlink();
    const playerTeam = this.room.getPlayerList().filter((p) => p.team === team);

    const blinkFunction = () => {
      playerTeam.forEach((p) => this.overrideSetPlayerAvatar(p.id, i % 2 === 0 ? avatar : null));
      i += 1;
    };
    this.blinkInterval = window.setInterval(blinkFunction, 200);
    blinkFunction();
  }

  private overrideSetPlayerAvatar(playerId: number, avatar: string | null) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore: Unreachable code error
    this.room.setPlayerAvatar(playerId, avatar);
  }

  // On est en match uniquement quand 2 équipes contiennent des joueurs inscrits
  private isMatch() {
    return (
      this.room.getPlayerList().some((p) => p.team === 1 && registeredUsers.find((rUser) => rUser.sessionId === p.id)) &&
      this.room.getPlayerList().some((p) => p.team === 2 && registeredUsers.find((rUser) => rUser.sessionId === p.id))
    );
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
