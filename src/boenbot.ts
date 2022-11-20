// https://github.com/haxball/haxball-issues/wiki/Headless-Host

let room; // Make it reachable in the developer console

class IndexedDBInit {
  private db?: IDBDatabase;

  constructor() {
    const DBOpenRequest = window.indexedDB.open("haxball");

    DBOpenRequest.onerror = (event) => {
      console.error("DBOpenRequest error", event);
    };
    DBOpenRequest.onupgradeneeded = () => {
      console.info("DB Upgrade needed !");
      const db = DBOpenRequest.result;
      const objectStore = db.createObjectStore("stats", {
        autoIncrement: false,
      });
      objectStore.createIndex("nbGoals", "nbGoals", { unique: false });
      objectStore.createIndex("nbOwnGoals", "nbOwnGoals", { unique: false });
    };
    DBOpenRequest.onsuccess = () => {
      console.info("DB initialized !");
      this.db = DBOpenRequest.result;
      this.db.onerror = (event) => {
        // Generic error handler for all errors targeted at this database's
        // requests!
        console.error(`Database error: ${event?.target}`);
      };

      room = new HaxballRoom(this.db);
    };
  }
}

new IndexedDBInit();

class HaxballRoom {
  private radiusBall = 10; // Classic map puck radius, you can change it with respect to the ball radius of your map.
  private radiusPlayer = 15; // The original player radius, you can change it with respect to the player radius of your map.

  private triggerDistance = this.radiusBall + this.radiusPlayer + 0.01; //Player ball distance tolerance. You can increase it for less sensitivity.

  private powerShotConfig = {
    enabled: false,
    timeout: 180, // This means 3 seconds.
    powerCoefficient: 2, //Original ball kick speed would be multiplied by this number when power shot is activated.
  };

  private playerLastActivities = new Map<number, IPlayerActivity>();
  private shouldWatchForIdlePlayers = false;
  private idleTimeout = 7 * 1000;

  private room: RoomObject;
  private currentNbPlayers = 0;

  private isTrainingMode = false;

  private db: IDBDatabase;

  private currentGame?: ICurrentGame;

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
      this.shouldWatchForIdlePlayers = true;
      this.playerLastActivities.clear();
      this.currentGame = { isGameTime: true, timePlayerBallTouch: 0, powerShotActive: false, scoring: [], startTime: new Date() };
    };
    this.room.onGameStop = (byPlayer) => {
      this.clearBlink();
      this.resetPlayerAvatar();
      this.currentGame!.isGameTime = false;
      this.shouldWatchForIdlePlayers = false;
    };
    this.room.onGamePause = (byPlayer) => {
      this.shouldWatchForIdlePlayers = false;
    };
    this.room.onGameUnpause = (byPlayer) => {
      this.shouldWatchForIdlePlayers = true;
      this.playerLastActivities.clear();
    };
    this.room.onGameTick = () => {
      if (this.shouldWatchForIdlePlayers && !this.isTrainingMode) {
        for (const [playerId, playerData] of this.playerLastActivities) {
          if (new Date().getTime() - playerData.date.getTime() > this.idleTimeout) {
            const player = this.room.getPlayer(playerId);
            if (player && player.team !== 0) {
              this.playerLastActivities.delete(playerId);
              this.room.setPlayerTeam(playerId, 0);
              this.room.sendAnnouncement(`😴 ${player.name} s'est assoupi, transfert en spectateur`);
            }
          }
        }
      }

      if (this.currentGame?.isGameTime && this.room.getScores() && this.room.getPlayerList().some((p) => p.team != 0)) {
        if (this.currentGame?.playerTouchingBall && this.powerShotConfig.enabled) {
          this.checkPowerShot();
        }
        this.setLastBallToucher();
      }
    };

    // Match LifeCycle
    this.room.onTeamGoal = (team) => {
      this.currentGame!.isGameTime = false;
      this.shouldWatchForIdlePlayers = false;
      const isOwnGoal = team !== this.currentGame?.lastBallToucher?.team;

      const registeredUser = registeredUsers.find((p) => p.sessionId === this.currentGame?.lastBallToucher?.id);
      if (registeredUser) {
        this.currentGame?.scoring.push({ playerId: registeredUser.id, time: new Date(), ownGoal: isOwnGoal, assist: false });
      }

      const announcements = [];
      if (isOwnGoal) {
        announcements.push(`⚽🚨 Magnifique CSC, GG ${this.currentGame?.lastBallToucher?.name} !`);
      } else {
        // const announcements = ["But chatte ?", "PO PO PO PO ⚽ ⚽ ⚽", "SUUUUUUUUUUUUU 💪🏻", "OOF 🌬️"];
        announcements.push(`⚽ But de ${this.currentGame?.lastBallToucher?.name}`);
      }
      if (this.currentGame?.lastBallAssist && this.currentGame?.lastBallAssist.id != this.currentGame?.lastBallToucher?.id) {
        const assistOwnGoal = team !== this.currentGame?.lastBallAssist?.team;
        announcements.push(`Sur une passe D de ${this.currentGame?.lastBallAssist?.name}`);

        const assistUser = registeredUsers.find((p) => p.sessionId === this.currentGame?.lastBallAssist?.id);
        if (assistUser) {
          this.currentGame?.scoring.push({ playerId: assistUser.id, time: new Date(), ownGoal: assistOwnGoal, assist: true });
        }
      }
      this.room.sendAnnouncement(announcements.join(" "), undefined, undefined, "bold", 2);

      const scores = this.room.getScores();
      const avatar = scores.blue === scores.scoreLimit || scores.red === scores.scoreLimit ? "🏆" : "⚽";
      this.blinkTeamAvatar(team, avatar);

      if (this.isMatch()) {
        if ((scores.red === 0 || scores.blue === 0) && (scores.scoreLimit - scores.red === 1 || scores.scoreLimit - scores.blue === 1)) {
          window.setTimeout(() => {
            this.room.sendAnnouncement(`Y'a des ${scores.blue === 0 ? "bleus" : "rouges"} ?`, undefined, 0xff00ff, "bold", 2);
          }, 1000);
        }
      }
    };
    this.room.onTeamVictory = (scores) => {
      this.shouldWatchForIdlePlayers = false;
      this.currentGame!.isGameTime = false;
      this.currentGame!.endTime = new Date();

      if (this.isMatch()) {
        this.currentGame?.scoring.forEach((scoring) => {
          if (!scoring.assist || (scoring.assist && !scoring.ownGoal)) {
            this.storePlayerStats(scoring.playerId, scoring.ownGoal, scoring.assist);
          }
        });
        // Si le slip d'une équipe a été arraché
        if (scores.blue === 0 || scores.red === 0) {
          this.room.sendAnnouncement("🍆 Mais c'est une pétée ?", undefined, 0xff00ff, "bold", 2);
        }
      }
    };
    this.room.onPositionsReset = () => {
      this.currentGame!.isGameTime = true;
      this.currentGame!.lastBallAssist = undefined;
      this.currentGame!.lastBallToucher = undefined;
      this.clearBlink();
      this.resetPlayerAvatar();
      this.shouldWatchForIdlePlayers = true;
      this.playerLastActivities.clear();
    };

    // Player LifeCycle
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
      const connectedPublicIds = registeredUsers.filter((rUser) => playerList.find((p) => p.id !== newPlayer.id && p.id === rUser.sessionId)).flatMap((rUser) => rUser.publicIds);

      if (connectedPublicIds.includes(newPlayer.auth)) {
        this.room.kickPlayer(newPlayer.id, "🍖 Tentative de jambonnage avec une double connexion ?", false);
        return;
      }

      // player.auth property is only set in the RoomObject.onPlayerJoin event.
      const registeredUser = registeredUsers.find((p) => p.publicIds.includes(newPlayer.auth)) || registeredUsers.find((p) => p.name === newPlayer.name);
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
      if (this.currentGame?.playerTouchingBall?.id === player.id && this.currentGame?.powerShotActive) {
        this.room.setDiscProperties(0, {
          xspeed: this.powerShotConfig.powerCoefficient * this.room.getDiscProperties(0).xspeed,
          yspeed: this.powerShotConfig.powerCoefficient * this.room.getDiscProperties(0).yspeed,
        });
        this.currentGame.powerShotActive = false;
      }
    };

    this.room.onPlayerChat = (player, msg) => {
      if (msg === "!powershot" || msg === "!ps") {
        this.powerShotConfig.enabled = !this.powerShotConfig.enabled;
        this.room.sendAnnouncement(`🚀 - ${this.powerShotConfig.enabled ? "Powershot activé ✅" : "Powershot désactivé ❌"} `);
      }
      if (msg.startsWith("!futsal") && player.admin) {
        this.changeStadium("futsal");
        return true;
      }
      if (msg.startsWith("!training") && player.admin) {
        this.changeStadium("training");
        return true;
      }
      if (msg.startsWith("!sniper") && player.admin) {
        this.changeStadium("sniper");
        return true;
      }
      if (msg === "!rematch" && player.admin) {
        this.room.stopGame();
        const players = this.room.getPlayerList();
        players.forEach((p) => {
          this.room.setPlayerTeam(p.id, p.team === 1 ? 2 : 1);
        });
        this.room.startGame();
      }
      if (msg === "!shuffle" && player.admin) {
        this.room.stopGame();
        const playerIdList = this.room.getPlayerList().map((p) => p.id);
        let currentIndex = playerIdList.length,
          randomIndex;
        while (currentIndex != 0) {
          randomIndex = Math.floor(Math.random() * currentIndex);
          currentIndex--;
          [playerIdList[currentIndex], playerIdList[randomIndex]] = [playerIdList[randomIndex], playerIdList[currentIndex]];
        }

        playerIdList.forEach((playerId, index) => this.room.setPlayerTeam(playerId, index % 2 == 0 ? 1 : 2));
        this.room.startGame();
      }
      if (msg === "!top") {
        const bite = this.db.transaction(["stats"], "readonly").objectStore("stats").getAll();
        bite.onsuccess = () => {
          console.log(bite.result);
          const stats = bite.result as IPlayerStats[];
          const messages: string[] = stats
            .sort((a, b) => (b.nbGoals !== a.nbGoals ? b.nbGoals - a.nbGoals : a.nbOwnGoals - b.nbOwnGoals))
            .map(
              (playerStats, index) =>
                `${(index < 3 && ["🥇", "🥈", "🥉"][index]) || "💩"} ${registeredUsers.find((player) => player.id === playerStats.playerId)?.name} - Buts: ${playerStats.nbGoals} / Assist : ${
                  playerStats.nbAssists
                } / CSC: ${playerStats.nbOwnGoals}`,
            );
          this.room.sendAnnouncement(messages.join("\n"));
        };
      }

      return true;
    };
  }

  private resetPlayerAvatar() {
    this.room.getPlayerList().forEach((p) => this.overrideSetPlayerAvatar(p.id, null));
  }

  private setLastBallToucher() {
    const ballPosition = this.room.getBallPosition();
    const playersTouchingBall = this.room.getPlayerList().filter((player) => player.team !== 0 && this.pointDistance(player.position, ballPosition) < this.triggerDistance);

    if (playersTouchingBall.length === 0) {
      this.currentGame!.powerShotActive = false;
      this.currentGame!.playerTouchingBall = undefined;
    } else if (playersTouchingBall.length === 1) {
      const player = playersTouchingBall[0];
      if (this.currentGame?.playerTouchingBall?.id !== player.id) {
        this.currentGame!.powerShotActive = false;
        this.currentGame!.playerTouchingBall = player;
        this.currentGame!.lastBallAssist = this.currentGame?.lastBallToucher;
        this.currentGame!.lastBallToucher = player;
      }
    } else {
      this.currentGame!.powerShotActive = false;
      this.currentGame!.playerTouchingBall = undefined;
    }
  }

  private pointDistance(p1: { x: number; y: number }, p2: { x: number; y: number }) {
    const d1 = p1.x - p2.x;
    const d2 = p1.y - p2.y;
    return Math.sqrt(d1 * d1 + d2 * d2);
  }

  private checkPowerShot() {
    if (this.pointDistance(this.room.getPlayerDiscProperties(this.currentGame!.lastBallToucher!.id), this.room.getDiscProperties(0)) < this.triggerDistance) {
      this.currentGame!.timePlayerBallTouch += 1;

      if (this.currentGame!.timePlayerBallTouch === this.powerShotConfig.timeout) {
        this.room.sendAnnouncement(`${this.currentGame?.playerTouchingBall?.name} peut envoyer une grosse boulette 🚀⚽ !`, undefined, 0x00ff00, "italic", 2); //Power shot is activated when the player touches to the ball for 3 seconds long.
      }
      if (this.currentGame!.timePlayerBallTouch >= this.powerShotConfig.timeout) {
        this.currentGame!.powerShotActive = true;
      }
    } else {
      if (this.currentGame!.timePlayerBallTouch != 0) {
        this.currentGame!.timePlayerBallTouch = 0;
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

interface RegisteredUser {
  id: string; // Internal ID
  name: string; // Internal name (deprecated)
  publicIds: string[]; // The player's public ID. Players can view their own ID's here: https://www.haxball.com/playerauth
  sessionId?: number; // The id of the player, each player that joins the room gets a unique id that will never change.
  greetings: string[];
}

interface ICurrentGame {
  playerTouchingBall?: PlayerObject;
  lastBallToucher?: PlayerObject;
  lastBallAssist?: PlayerObject;
  isGameTime: boolean;
  powerShotActive: boolean;
  timePlayerBallTouch: number; //The time indicator that increases as player touched to the ball
  scoring: { playerId: string; time: Date; ownGoal: boolean; assist: boolean }[];
  startTime: Date;
  endTime?: Date;
}
type MapTypes = "futsal" | "classic" | "sniper" | "training";
interface ICustomMap {
  type: MapTypes;
  players: number;
  content: string;
}
interface IPlayerActivity {
  date: Date;
}
interface IPlayerStats {
  playerId: string;
  nbGoals: number;
  nbOwnGoals: number;
  nbAssists: number;
}

const registeredUsers: RegisteredUser[] = [
  {
    id: "fish",
    name: "Fish",
    publicIds: ["OKlLNmjrZvzihrET0nt-y1QIS9T9iK0NsQQAy3Wqe0s", "DvYez5QUWhoEW5Tn3vUrXthpuZkr5Dz19_1MNbGtETs", "P7uUiHk6cCIKLQ7xx7uTgMQwCxcI_tSnaOOoZeS_TeU"],
    greetings: ["Voilà le meilleur joueur 🐠 !", "Bonjour Dieu"],
  },
  {
    id: "dofunk",
    name: "Dofunk",
    publicIds: ["r2MhTPxiTWSKNwg7DNTcTHEV2c6FbdPN0qXJ5ICtsjA"],
    greetings: ["Le petit cowboy vient d'entrer dans la room ! 🤠", "Nicolas ? Tu es réveillé ?! 💤"],
  },
  {
    id: "val",
    name: "Hunt3ur",
    publicIds: ["ymOq0imV3LTinY6mEACkG6utlTjcZXLGQLQzpaPeXjA"],
    greetings: ["Rick Hunter est dans la place 🦊", "Tiens, y'a VAL !"],
  },
  {
    id: "froot",
    name: "Franfoot",
    publicIds: ["hnGi__rCaFlCEulyO6AFgfZZJ1TIBBwJBJOjQXAJ4mw"],
    greetings: ["Le boule le plus charpenté de l'histoire est parmi nous ! 🍑💪", "Belle intuition, FOUTRE!"],
  },
  {
    id: "pat",
    name: "Pat",
    publicIds: [],
    greetings: ["Paaat' ! 🍹💃🏽🇧🇷", "OMG Paaat' ! 🍹💃🏽🇧🇷", "PAT' LA CHATTE ! 🍹💃🏽🇧🇷"],
  },
  {
    id: "laura",
    name: "Laura",
    publicIds: [],
    greetings: ["🥦🥦🥦🥦🥦🥦🥦🥦🥦🥦🥦🥦🥦🥦🥦🥦🥦🥦🥦🥦🥦🥦"],
  },
  {
    id: "vv",
    name: "the wolf",
    publicIds: ["B0WriS404UO1gLBStVtizVVlDeqqJSa4W9QYzhuwdYQ"],
    greetings: ["Un membre de la Drama Team s'est connecté 🐺 !", "Aaahooouuuuuuuuu 🐺"],
  },
  {
    id: "thompoul",
    name: "thompoul",
    publicIds: ["ouwBCSX9sRDL1T6irDgnyLmDfTDV6QQ5f37A_-6S2nM"],
    greetings: ["Bonjour Thomas POGNON ! 💵🤑₿", "L'autre membre de la Drama Team s'est connecté 🐴 !"],
  },
];

const maps: ICustomMap[] = [
  {
    type: "futsal",
    players: 2 * 2,
    content:
      '{"name":"Futsal 1x1 2x2 from HaxMaps","width":420,"height":200,"spawnDistance":180,"bg":{"type":"hockey","width":368,"height":171,"kickOffRadius":65,"cornerRadius":0},"vertexes":[{"x":-368,"y":171,"trait":"ballArea","cMask":["ball"],"bCoef":1},{"x":-368,"y":65,"trait":"ballArea","cMask":["ball"],"bCoef":1},{"x":-368,"y":-65,"trait":"ballArea","cMask":["ball"],"bCoef":1},{"x":-368,"y":-171,"trait":"ballArea","bCoef":1,"cMask":["ball"]},{"x":368,"y":171,"trait":"ballArea","cMask":["ball"],"bCoef":1},{"x":368,"y":65,"trait":"ballArea","cMask":["ball"],"bCoef":1},{"x":368,"y":-65,"trait":"ballArea","cMask":["ball"],"bCoef":1},{"x":368,"y":-171,"trait":"ballArea","cMask":["ball"],"bCoef":1},{"x":0,"y":65,"trait":"kickOffBarrier"},{"x":0,"y":-65,"trait":"line"},{"bCoef":0.1,"cMask":["ball"],"trait":"goalNet","x":-384,"y":-65},{"bCoef":0.1,"cMask":["ball"],"trait":"goalNet","x":384,"y":-65},{"bCoef":0.1,"cMask":["ball"],"trait":"goalNet","x":-384,"y":65},{"bCoef":0.1,"cMask":["ball"],"trait":"goalNet","x":384,"y":65},{"bCoef":1,"trait":"ballArea","x":368,"y":171},{"bCoef":1,"trait":"ballArea","x":368,"y":-171},{"bCoef":0,"trait":"line","x":0,"y":171},{"bCoef":0,"trait":"line","x":0,"y":-171},{"x":0,"y":65,"trait":"kickOffBarrier"},{"x":0,"y":-65,"trait":"kickOffBarrier"},{"x":377,"y":-65,"trait":"line","cMask":["ball"],"bCoef":1},{"x":377,"y":-171,"trait":"ballArea","cMask":["ball"],"bCoef":1},{"x":-377,"y":-65,"trait":"line","cMask":["ball"],"bCoef":1},{"x":-377,"y":-171,"trait":"ballArea","cMask":["ball"],"bCoef":1},{"x":-377,"y":65,"trait":"line","cMask":["ball"],"bCoef":1},{"x":-377,"y":171,"trait":"ballArea","cMask":["ball"],"bCoef":1},{"x":377,"y":65,"trait":"line","cMask":["ball"],"bCoef":1},{"x":377,"y":171,"trait":"ballArea","cMask":["ball"],"bCoef":1},{"x":0,"y":199,"trait":"kickOffBarrier"},{"x":0,"y":65,"trait":"kickOffBarrier"},{"x":0,"y":-65,"trait":"kickOffBarrier"},{"x":0,"y":-199,"trait":"kickOffBarrier"}],"segments":[{"v0":0,"v1":1,"trait":"ballArea"},{"v0":2,"v1":3,"trait":"ballArea"},{"v0":4,"v1":5,"trait":"ballArea"},{"v0":6,"v1":7,"trait":"ballArea"},{"v0":8,"v1":9,"trait":"kickOffBarrier","curve":180,"cGroup":["blueKO"]},{"v0":8,"v1":9,"trait":"kickOffBarrier","curve":-180,"cGroup":["redKO"]},{"vis":true,"bCoef":0.1,"cMask":["all"],"trait":"goalNet","v0":2,"v1":10,"color":"FFFFFF","curve":-35},{"vis":true,"bCoef":0.1,"cMask":["all"],"trait":"goalNet","v0":6,"v1":11,"color":"FFFFFF","curve":35},{"vis":true,"bCoef":0.1,"cMask":["all"],"trait":"goalNet","v0":1,"v1":12,"color":"FFFFFF","curve":35},{"vis":true,"bCoef":0.1,"cMask":["all"],"trait":"goalNet","v0":5,"v1":13,"color":"FFFFFF","curve":-35},{"vis":true,"bCoef":0.1,"cMask":["ball"],"trait":"goalNet","v0":10,"v1":12,"x":-585,"color":"FFFFFF","curve":-35},{"vis":true,"bCoef":0.1,"cMask":["ball"],"trait":"goalNet","v0":11,"v1":13,"x":585,"color":"FFFFFF","curve":35},{"vis":true,"color":"FFFFFF","bCoef":1,"trait":"ballArea","v0":1,"v1":0,"cMask":["ball"],"x":-368},{"vis":true,"color":"FFFFFF","bCoef":1,"trait":"ballArea","v0":5,"v1":4,"cMask":["ball"],"x":368},{"vis":true,"color":"FFFFFF","bCoef":1,"trait":"ballArea","v0":2,"v1":3,"cMask":["ball"],"x":-368},{"vis":true,"color":"FFFFFF","bCoef":1,"trait":"ballArea","v0":6,"v1":7,"cMask":["ball"],"x":368},{"vis":true,"color":"FFFFFF","bCoef":1,"trait":"ballArea","v0":0,"v1":14,"y":171},{"vis":true,"color":"FFFFFF","bCoef":1,"trait":"ballArea","v0":3,"v1":15,"y":-171},{"curve":0,"vis":true,"color":"FFFFFF","bCoef":0,"trait":"line","v0":16,"v1":17},{"curve":-180,"vis":true,"color":"FFFFFF","bCoef":0,"trait":"line","v0":9,"v1":8},{"curve":180,"vis":true,"color":"FFFFFF","bCoef":0,"trait":"line","v0":19,"v1":18},{"curve":0,"vis":true,"color":"FFFFFF","bCoef":0,"trait":"line","v0":2,"v1":1},{"curve":0,"vis":true,"color":"FFFFFF","bCoef":0,"trait":"line","v0":6,"v1":5},{"vis":false,"color":"FFFFFF","bCoef":1,"trait":"ballArea","v0":20,"v1":21,"cMask":["ball"],"x":330},{"vis":false,"color":"FFFFFF","bCoef":1,"trait":"ballArea","v0":22,"v1":23,"cMask":["ball"],"x":-330},{"vis":false,"color":"FFFFFF","bCoef":1,"trait":"ballArea","v0":24,"v1":25,"cMask":["ball"],"x":-330},{"vis":false,"color":"FFFFFF","bCoef":1,"trait":"ballArea","v0":26,"v1":27,"cMask":["ball"],"x":330},{"v0":28,"v1":29,"trait":"kickOffBarrier"},{"v0":30,"v1":31,"trait":"kickOffBarrier"}],"goals":[{"p0":[-377,-65],"p1":[-377,65],"team":"red"},{"p0":[377,65],"p1":[377,-65],"team":"blue"}],"discs":[{"pos":[-368,65],"trait":"goalPost","color":"FFFFFF","radius":5},{"pos":[-368,-65],"trait":"goalPost","color":"FFFFFF","radius":5},{"pos":[368,65],"trait":"goalPost","color":"FFFFFF","radius":5},{"pos":[368,-65],"trait":"goalPost","color":"FFFFFF","radius":5}],"planes":[{"normal":[0,1],"dist":-171,"trait":"ballArea"},{"normal":[0,-1],"dist":-171,"trait":"ballArea"},{"normal":[0,1],"dist":-200,"bCoef":0.2,"cMask":["all"]},{"normal":[0,-1],"dist":-200,"bCoef":0.2,"cMask":["all"]},{"normal":[1,0],"dist":-420,"bCoef":0.2,"cMask":["all"]},{"normal":[-1,0],"dist":-420,"bCoef":0.2,"cMask":["all"]}],"traits":{"ballArea":{"vis":false,"bCoef":1,"cMask":["ball"]},"goalPost":{"radius":8,"invMass":0,"bCoef":1},"goalNet":{"vis":true,"bCoef":0.1,"cMask":["all"]},"kickOffBarrier":{"vis":false,"bCoef":0.1,"cGroup":["redKO","blueKO"],"cMask":["red","blue"]},"line":{"vis":true,"bCoef":0,"cMask":[""]},"arco":{"radius":2,"cMask":["n\\/d"],"color":"cccccc"}},"playerPhysics":{"acceleration":0.11,"kickingAcceleration":0.1,"kickStrength":7},"ballPhysics":{"radius":6.4,"color":"EAFF00"}}',
  },
  {
    type: "futsal",
    players: 5 * 5,
    content:
      '{"name":"Futsal x3  by Bazinga from HaxMaps","width":620,"height":270,"spawnDistance":350,"bg":{"type":"hockey","width":550,"height":240,"kickOffRadius":80,"cornerRadius":0},"vertexes":[{"x":550,"y":240,"trait":"ballArea"},{"x":550,"y":-240,"trait":"ballArea"},{"x":0,"y":270,"trait":"kickOffBarrier"},{"x":0,"y":80,"bCoef":0.15,"trait":"kickOffBarrier","color":"F8F8F8","vis":true,"curve":180},{"x":0,"y":-80,"bCoef":0.15,"trait":"kickOffBarrier","color":"F8F8F8","vis":true,"curve":180},{"x":0,"y":-270,"trait":"kickOffBarrier"},{"x":-550,"y":-80,"cMask":["red","blue","ball"],"trait":"goalNet","curve":0,"color":"F8F8F8","pos":[-700,-80]},{"x":-590,"y":-80,"cMask":["red","blue","ball"],"trait":"goalNet","curve":0,"color":"F8F8F8","pos":[-700,-80]},{"x":-590,"y":80,"cMask":["red","blue","ball"],"trait":"goalNet","curve":0,"color":"F8F8F8","pos":[-700,80]},{"x":-550,"y":80,"cMask":["red","blue","ball"],"trait":"goalNet","curve":0,"color":"F8F8F8","pos":[-700,80]},{"x":550,"y":-80,"cMask":["red","blue","ball"],"trait":"goalNet","curve":0,"color":"F8F8F8","pos":[700,-80]},{"x":590,"y":-80,"cMask":["red","blue","ball"],"trait":"goalNet","curve":0,"color":"F8F8F8","pos":[700,-80]},{"x":590,"y":80,"cMask":["red","blue","ball"],"trait":"goalNet","curve":0,"color":"F8F8F8","pos":[700,80]},{"x":550,"y":80,"cMask":["red","blue","ball"],"trait":"goalNet","curve":0,"color":"F8F8F8","pos":[700,80]},{"x":-550,"y":80,"bCoef":1.15,"cMask":["ball"],"trait":"ballArea","color":"F8F8F8","pos":[-700,80]},{"x":-550,"y":240,"bCoef":1.15,"cMask":["ball"],"trait":"ballArea","color":"F8F8F8"},{"x":-550,"y":-80,"bCoef":1.15,"cMask":["ball"],"trait":"ballArea","color":"F8F8F8","pos":[-700,-80]},{"x":-550,"y":-240,"bCoef":1.15,"cMask":["ball"],"trait":"ballArea","color":"F8F8F8"},{"x":-550,"y":240,"bCoef":1,"cMask":["ball"],"trait":"ballArea"},{"x":550,"y":240,"bCoef":1,"cMask":["ball"],"trait":"ballArea"},{"x":550,"y":80,"bCoef":1.15,"cMask":["ball"],"trait":"ballArea","pos":[700,80]},{"x":550,"y":240,"bCoef":1.15,"cMask":["ball"],"trait":"ballArea"},{"x":550,"y":-240,"bCoef":1.15,"cMask":["ball"],"trait":"ballArea","color":"F8F8F8"},{"x":550,"y":-80,"bCoef":1.15,"cMask":["ball"],"trait":"ballArea","color":"F8F8F8","pos":[700,-80]},{"x":550,"y":-240,"bCoef":0,"cMask":["ball"],"trait":"ballArea"},{"x":550,"y":-240,"bCoef":0,"cMask":["ball"],"trait":"ballArea"},{"x":-550,"y":-240,"bCoef":1,"cMask":["ball"],"trait":"ballArea","curve":0},{"x":550,"y":-240,"bCoef":1,"cMask":["ball"],"trait":"ballArea","curve":0},{"x":0,"y":-240,"bCoef":0.1,"cMask":["red","blue"],"cGroup":["redKO","blueKO"],"trait":"kickOffBarrier"},{"x":0,"y":-80,"bCoef":0.1,"cMask":["red","blue"],"cGroup":["redKO","blueKO"],"trait":"kickOffBarrier"},{"x":0,"y":80,"bCoef":0.1,"cMask":["red","blue"],"cGroup":["redKO","blueKO"],"trait":"kickOffBarrier"},{"x":0,"y":240,"bCoef":0.1,"cMask":["red","blue"],"cGroup":["redKO","blueKO"],"trait":"kickOffBarrier"},{"x":0,"y":-80,"bCoef":0.1,"cMask":["red","blue"],"trait":"kickOffBarrier","vis":true,"color":"F8F8F8"},{"x":0,"y":80,"bCoef":0.1,"cMask":["red","blue"],"trait":"kickOffBarrier","vis":true,"color":"F8F8F8"},{"x":0,"y":80,"trait":"kickOffBarrier","color":"F8F8F8","vis":true,"curve":-180},{"x":0,"y":-80,"trait":"kickOffBarrier","color":"F8F8F8","vis":true,"curve":-180},{"x":0,"y":80,"trait":"kickOffBarrier","color":"F8F8F8","vis":true,"curve":0},{"x":0,"y":-80,"trait":"kickOffBarrier","color":"F8F8F8","vis":true,"curve":0},{"x":-557.5,"y":80,"bCoef":1,"cMask":["ball"],"trait":"ballArea","curve":0,"vis":false,"pos":[-700,80]},{"x":-557.5,"y":240,"bCoef":1,"cMask":["ball"],"trait":"ballArea","curve":0,"vis":false},{"x":-557.5,"y":-240,"bCoef":1,"cMask":["ball"],"trait":"ballArea","vis":false,"curve":0},{"x":-557.5,"y":-80,"bCoef":1,"cMask":["ball"],"trait":"ballArea","vis":false,"curve":0,"pos":[-700,-80]},{"x":557.5,"y":-240,"bCoef":1,"cMask":["ball"],"trait":"ballArea","vis":false,"curve":0},{"x":557.5,"y":-80,"bCoef":1,"cMask":["ball"],"trait":"ballArea","vis":false,"curve":0,"pos":[700,-80]},{"x":557.5,"y":80,"bCoef":1,"cMask":["ball"],"trait":"ballArea","curve":0,"vis":false,"pos":[700,80]},{"x":557.5,"y":240,"bCoef":1,"cMask":["ball"],"trait":"ballArea","curve":0,"vis":false},{"x":0,"y":-80,"bCoef":0.1,"trait":"line"},{"x":0,"y":80,"bCoef":0.1,"trait":"line"},{"x":-550,"y":-80,"bCoef":0.1,"trait":"line"},{"x":-550,"y":80,"bCoef":0.1,"trait":"line"},{"x":550,"y":-80,"bCoef":0.1,"trait":"line"},{"x":550,"y":80,"bCoef":0.1,"trait":"line"},{"x":-240,"y":256,"bCoef":0.1,"trait":"line"},{"x":-120,"y":256,"bCoef":0.1,"trait":"line"},{"x":-240,"y":-256,"bCoef":0.1,"trait":"line"},{"x":-120,"y":-224,"bCoef":0.1,"trait":"line"},{"x":-120,"y":-256,"bCoef":0.1,"trait":"line"},{"x":240,"y":256,"bCoef":0.1,"trait":"line"},{"x":120,"y":224,"bCoef":0.1,"trait":"line"},{"x":120,"y":256,"bCoef":0.1,"trait":"line"},{"x":240,"y":-224,"bCoef":0.1,"trait":"line"},{"x":240,"y":-256,"bCoef":0.1,"trait":"line"},{"x":120,"y":-224,"bCoef":0.1,"trait":"line"},{"x":120,"y":-256,"bCoef":0.1,"trait":"line"},{"x":-381,"y":240,"bCoef":0.1,"trait":"line"},{"x":-381,"y":256,"bCoef":0.1,"trait":"line"},{"x":-550,"y":200,"bCoef":0.1,"trait":"line","color":"F8F8F8","curve":-90},{"x":-390,"y":70,"bCoef":0.1,"trait":"line","color":"F8F8F8","curve":0},{"x":-550,"y":226,"bCoef":0.1,"trait":"line","curve":-90},{"x":-536,"y":240,"bCoef":0.1,"trait":"line","curve":-90},{"x":-550,"y":-200,"bCoef":0.1,"trait":"line","color":"F8F8F8","curve":90},{"x":-390,"y":-70,"bCoef":0.1,"trait":"line","color":"F8F8F8","curve":0},{"x":-550,"y":-226,"bCoef":0.1,"trait":"line","curve":90},{"x":-536,"y":-240,"bCoef":0.1,"trait":"line","curve":90},{"x":-556,"y":123,"bCoef":0.1,"trait":"line"},{"x":-575,"y":123,"bCoef":0.1,"trait":"line"},{"x":556,"y":123,"bCoef":0.1,"trait":"line"},{"x":575,"y":123,"bCoef":0.1,"trait":"line"},{"x":-556,"y":-123,"bCoef":0.1,"trait":"line"},{"x":-575,"y":-123,"bCoef":0.1,"trait":"line"},{"x":556,"y":-123,"bCoef":0.1,"trait":"line"},{"x":575,"y":-123,"bCoef":0.1,"trait":"line"},{"x":-381,"y":-240,"bCoef":0.1,"trait":"line"},{"x":-381,"y":-256,"bCoef":0.1,"trait":"line"},{"x":381,"y":240,"bCoef":0.1,"trait":"line"},{"x":381,"y":256,"bCoef":0.1,"trait":"line"},{"x":381,"y":-240,"bCoef":0.1,"trait":"line"},{"x":381,"y":-256,"bCoef":0.1,"trait":"line"},{"x":550,"y":-226,"bCoef":0.1,"trait":"line","curve":-90},{"x":536,"y":-240,"bCoef":0.1,"trait":"line","curve":-90},{"x":550,"y":226,"bCoef":0.1,"trait":"line","curve":90},{"x":536,"y":240,"bCoef":0.1,"trait":"line","curve":90},{"x":550,"y":200,"bCoef":0.1,"trait":"line","color":"F8F8F8","curve":90},{"x":390,"y":70,"bCoef":0.1,"trait":"line","color":"F8F8F8","curve":90},{"x":550,"y":-200,"bCoef":0.1,"trait":"line","color":"F8F8F8","curve":-90},{"x":390,"y":-70,"bCoef":0.1,"trait":"line","color":"F8F8F8","curve":-90},{"x":390,"y":70,"bCoef":0.1,"trait":"line","color":"F8F8F8","curve":0},{"x":390,"y":-70,"bCoef":0.1,"trait":"line","color":"F8F8F8","curve":0},{"x":-375,"y":1,"bCoef":0.1,"trait":"line","curve":180},{"x":-375,"y":-1,"bCoef":0.1,"trait":"line","curve":180},{"x":-375,"y":3,"bCoef":0.1,"trait":"line","curve":180},{"x":-375,"y":-3,"bCoef":0.1,"trait":"line","curve":180},{"x":-375,"y":-2,"bCoef":0.1,"trait":"line","curve":180},{"x":-375,"y":2,"bCoef":0.1,"trait":"line","curve":180},{"x":-375,"y":-3.5,"bCoef":0.1,"trait":"line","curve":180},{"x":-375,"y":3.5,"bCoef":0.1,"trait":"line","curve":180},{"x":375,"y":1,"bCoef":0.1,"trait":"line","curve":180},{"x":375,"y":-1,"bCoef":0.1,"trait":"line","curve":180},{"x":375,"y":3,"bCoef":0.1,"trait":"line","curve":180},{"x":375,"y":-3,"bCoef":0.1,"trait":"line","curve":180},{"x":375,"y":-2,"bCoef":0.1,"trait":"line","curve":180},{"x":375,"y":2,"bCoef":0.1,"trait":"line","curve":180},{"x":375,"y":-3.5,"bCoef":0.1,"trait":"line","curve":180},{"x":375,"y":3.5,"bCoef":0.1,"trait":"line","curve":180},{"x":-277.5,"y":1,"bCoef":0.1,"trait":"line","curve":180},{"x":-277.5,"y":-1,"bCoef":0.1,"trait":"line","curve":180},{"x":-277.5,"y":3,"bCoef":0.1,"trait":"line","curve":180},{"x":-277.5,"y":-3,"bCoef":0.1,"trait":"line","curve":180},{"x":-277.5,"y":-2,"bCoef":0.1,"trait":"line","curve":180},{"x":-277.5,"y":2,"bCoef":0.1,"trait":"line","curve":180},{"x":-277.5,"y":-3.5,"bCoef":0.1,"trait":"line","curve":180},{"x":-277.5,"y":3.5,"bCoef":0.1,"trait":"line","curve":180},{"x":277.5,"y":1,"bCoef":0.1,"trait":"line","curve":180},{"x":277.5,"y":-1,"bCoef":0.1,"trait":"line","curve":180},{"x":277.5,"y":3,"bCoef":0.1,"trait":"line","curve":180},{"x":277.5,"y":-3,"bCoef":0.1,"trait":"line","curve":180},{"x":277.5,"y":-2,"bCoef":0.1,"trait":"line","curve":180},{"x":277.5,"y":2,"bCoef":0.1,"trait":"line","curve":180},{"x":277.5,"y":-3.5,"bCoef":0.1,"trait":"line","curve":180},{"x":277.5,"y":3.5,"bCoef":0.1,"trait":"line","curve":180}],"segments":[{"v0":6,"v1":7,"curve":0,"color":"F8F8F8","cMask":["red","blue","ball"],"trait":"goalNet","pos":[-700,-80],"y":-80},{"v0":7,"v1":8,"color":"F8F8F8","cMask":["red","blue","ball"],"trait":"goalNet","x":-590},{"v0":8,"v1":9,"curve":0,"color":"F8F8F8","cMask":["red","blue","ball"],"trait":"goalNet","pos":[-700,80],"y":80},{"v0":10,"v1":11,"curve":0,"color":"F8F8F8","cMask":["red","blue","ball"],"trait":"goalNet","pos":[700,-80],"y":-80},{"v0":11,"v1":12,"color":"F8F8F8","cMask":["red","blue","ball"],"trait":"goalNet","x":590},{"v0":12,"v1":13,"curve":0,"color":"F8F8F8","cMask":["red","blue","ball"],"trait":"goalNet","pos":[700,80],"y":80},{"v0":2,"v1":3,"trait":"kickOffBarrier"},{"v0":3,"v1":4,"curve":180,"vis":true,"color":"F8F8F8","bCoef":0.15,"cGroup":["blueKO"],"trait":"kickOffBarrier"},{"v0":3,"v1":4,"curve":-180,"vis":true,"color":"F8F8F8","bCoef":0.15,"cGroup":["redKO"],"trait":"kickOffBarrier"},{"v0":4,"v1":5,"trait":"kickOffBarrier"},{"v0":14,"v1":15,"vis":true,"color":"F8F8F8","bCoef":1.15,"cMask":["ball"],"trait":"ballArea","x":-550},{"v0":16,"v1":17,"vis":true,"color":"F8F8F8","bCoef":1.15,"cMask":["ball"],"trait":"ballArea","x":-550},{"v0":18,"v1":19,"vis":true,"color":"F8F8F8","bCoef":1,"cMask":["ball"],"trait":"ballArea","y":240},{"v0":20,"v1":21,"vis":true,"color":"F8F8F8","bCoef":1.15,"cMask":["ball"],"trait":"ballArea","x":550},{"v0":22,"v1":23,"vis":true,"color":"F8F8F8","bCoef":1.15,"cMask":["ball"],"trait":"ballArea","x":550},{"v0":24,"v1":25,"vis":true,"color":"F8F8F8","bCoef":0,"cMask":["ball"],"trait":"ballArea","x":550,"y":-240},{"v0":26,"v1":27,"curve":0,"vis":true,"color":"F8F8F8","bCoef":1,"cMask":["ball"],"trait":"ballArea","y":-240},{"v0":28,"v1":29,"vis":true,"color":"F8F8F8","bCoef":0.1,"cMask":["red","blue"],"cGroup":["redKO","blueKO"],"trait":"kickOffBarrier"},{"v0":30,"v1":31,"vis":true,"color":"F8F8F8","bCoef":0.1,"cMask":["red","blue"],"cGroup":["redKO","blueKO"],"trait":"kickOffBarrier"},{"v0":38,"v1":39,"curve":0,"vis":false,"color":"F8F8F8","bCoef":1,"cMask":["ball"],"trait":"ballArea","x":-557.5},{"v0":40,"v1":41,"curve":0,"vis":false,"color":"F8F8F8","bCoef":1,"cMask":["ball"],"trait":"ballArea","x":-557.5},{"v0":42,"v1":43,"curve":0,"vis":false,"color":"F8F8F8","bCoef":1,"cMask":["ball"],"trait":"ballArea","x":557.5},{"v0":44,"v1":45,"curve":0,"vis":false,"color":"F8F8F8","bCoef":1,"cMask":["ball"],"trait":"ballArea","x":557.5},{"v0":46,"v1":47,"curve":0,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":0},{"v0":48,"v1":49,"curve":0,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":-550},{"v0":50,"v1":51,"curve":0,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":550},{"v0":64,"v1":65,"curve":0,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":-381},{"v0":66,"v1":67,"curve":-90,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line"},{"v0":69,"v1":68,"curve":-90,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line"},{"v0":70,"v1":71,"curve":90,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line"},{"v0":67,"v1":71,"curve":0,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line"},{"v0":73,"v1":72,"curve":90,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line"},{"v0":74,"v1":75,"curve":0,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":-240,"y":123},{"v0":76,"v1":77,"curve":0,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":-240,"y":123},{"v0":78,"v1":79,"curve":0,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":-240,"y":-123},{"v0":80,"v1":81,"curve":0,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":-240,"y":-123},{"v0":82,"v1":83,"curve":0,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":-381},{"v0":84,"v1":85,"curve":0,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":381},{"v0":86,"v1":87,"curve":0,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":381},{"v0":89,"v1":88,"curve":-90,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line"},{"v0":91,"v1":90,"curve":90,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line"},{"v0":92,"v1":93,"curve":90,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line"},{"v0":94,"v1":95,"curve":-90,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line"},{"v0":96,"v1":97,"curve":0,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":390},{"v0":99,"v1":98,"curve":180,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":-375},{"v0":98,"v1":99,"curve":180,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":-375},{"v0":101,"v1":100,"curve":180,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":-375},{"v0":100,"v1":101,"curve":180,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":-375},{"v0":103,"v1":102,"curve":180,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":-375},{"v0":102,"v1":103,"curve":180,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":-375},{"v0":105,"v1":104,"curve":180,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":-375},{"v0":104,"v1":105,"curve":180,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":-375},{"v0":107,"v1":106,"curve":180,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":375},{"v0":106,"v1":107,"curve":180,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":375},{"v0":109,"v1":108,"curve":180,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":375},{"v0":108,"v1":109,"curve":180,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":375},{"v0":111,"v1":110,"curve":180,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":375},{"v0":110,"v1":111,"curve":180,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":375},{"v0":113,"v1":112,"curve":180,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":375},{"v0":112,"v1":113,"curve":180,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":375},{"v0":115,"v1":114,"curve":180,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":-277.5},{"v0":114,"v1":115,"curve":180,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":-277.5},{"v0":117,"v1":116,"curve":180,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":-277.5},{"v0":116,"v1":117,"curve":180,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":-277.5},{"v0":119,"v1":118,"curve":180,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":-277.5},{"v0":118,"v1":119,"curve":180,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":-277.5},{"v0":121,"v1":120,"curve":180,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":-277.5},{"v0":120,"v1":121,"curve":180,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":-277.5},{"v0":123,"v1":122,"curve":180,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":277.5},{"v0":122,"v1":123,"curve":180,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":277.5},{"v0":125,"v1":124,"curve":180,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":277.5},{"v0":124,"v1":125,"curve":180,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":277.5},{"v0":127,"v1":126,"curve":180,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":277.5},{"v0":126,"v1":127,"curve":180,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":277.5},{"v0":129,"v1":128,"curve":180,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":277.5},{"v0":128,"v1":129,"curve":180,"vis":true,"color":"F8F8F8","bCoef":0.1,"trait":"line","x":277.5}],"goals":[{"p0":[-557.5,-80],"p1":[-557.5,80],"team":"red"},{"p0":[557.5,80],"p1":[557.5,-80],"team":"blue"}],"discs":[{"radius":5,"pos":[-550,80],"color":"FF6666","trait":"goalPost","y":80},{"radius":5,"pos":[-550,-80],"color":"FF6666","trait":"goalPost","y":-80,"x":-560},{"radius":5,"pos":[550,80],"color":"6666FF","trait":"goalPost","y":80},{"radius":5,"pos":[550,-80],"color":"6666FF","trait":"goalPost","y":-80},{"radius":3,"invMass":0,"pos":[-550,240],"color":"FFCC00","bCoef":0.1,"trait":"line"},{"radius":3,"invMass":0,"pos":[-550,-240],"color":"FFCC00","bCoef":0.1,"trait":"line"},{"radius":3,"invMass":0,"pos":[550,-240],"color":"FFCC00","bCoef":0.1,"trait":"line"},{"radius":3,"invMass":0,"pos":[550,240],"color":"FFCC00","bCoef":0.1,"trait":"line"}],"planes":[{"normal":[0,1],"dist":-240,"bCoef":1,"trait":"ballArea","vis":false,"curve":0},{"normal":[0,-1],"dist":-240,"bCoef":1,"trait":"ballArea"},{"normal":[0,1],"dist":-270,"bCoef":0.1},{"normal":[0,-1],"dist":-270,"bCoef":0.1},{"normal":[1,0],"dist":-620,"bCoef":0.1},{"normal":[-1,0],"dist":-620,"bCoef":0.1},{"normal":[1,0],"dist":-620,"bCoef":0.1,"trait":"ballArea","vis":false,"curve":0},{"normal":[-1,0],"dist":-620,"bCoef":0.1,"trait":"ballArea","vis":false,"curve":0}],"traits":{"ballArea":{"vis":false,"bCoef":1,"cMask":["ball"]},"goalPost":{"radius":8,"invMass":0,"bCoef":0.5},"goalNet":{"vis":true,"bCoef":0.1,"cMask":["ball"]},"line":{"vis":true,"bCoef":0.1,"cMask":[""]},"kickOffBarrier":{"vis":false,"bCoef":0.1,"cGroup":["redKO","blueKO"],"cMask":["red","blue"]}},"playerPhysics":{"bCoef":0,"acceleration":0.11,"kickingAcceleration":0.083,"kickStrength":5},"ballPhysics":{"radius":6.25,"bCoef":0.4,"invMass":1.5,"damping":0.99,"color":"FFCC00"}}',
  },
  {
    type: "futsal",
    players: 1 * 1,
    content:
      '{"name":"Futsal 1v1 2v2 from HaxMaps","width":420,"height":200,"spawnDistance":180,"bg":{"type":"hockey","width":368,"height":171,"kickOffRadius":50,"cornerRadius":0},"vertexes":[{"x":-368,"y":171,"bCoef":1,"cMask":["ball"],"trait":"ballArea"},{"x":-368,"y":50,"bCoef":1,"cMask":["ball"],"trait":"ballArea"},{"x":-368,"y":-50,"bCoef":1,"cMask":["ball"],"trait":"ballArea"},{"x":-368,"y":-171,"bCoef":1,"cMask":["ball"],"trait":"ballArea"},{"x":368,"y":171,"bCoef":1,"cMask":["ball"],"trait":"ballArea"},{"x":368,"y":50,"bCoef":1,"cMask":["ball"],"trait":"ballArea"},{"x":368,"y":-50,"bCoef":1,"cMask":["ball"],"trait":"ballArea"},{"x":368,"y":-171,"bCoef":1,"cMask":["ball"],"trait":"ballArea"},{"x":0,"y":176,"trait":"kickOffBarrier"},{"x":0,"y":50,"trait":"kickOffBarrier"},{"x":0,"y":-50,"trait":"line"},{"x":0,"y":-176,"trait":"kickOffBarrier"},{"x":-384,"y":-50,"bCoef":0.1,"cMask":["all"],"trait":"goalNet"},{"x":384,"y":-50,"bCoef":0.1,"cMask":["all"],"trait":"goalNet"},{"x":-384,"y":50,"bCoef":0.1,"cMask":["all"],"trait":"goalNet"},{"x":384,"y":50,"bCoef":0.1,"cMask":["all"],"trait":"goalNet"},{"x":-368,"y":-127,"trait":"line"},{"x":368,"y":-127,"trait":"line"},{"x":-368,"y":127,"trait":"line"},{"x":368,"y":127,"trait":"line"},{"x":-350,"y":-171,"bCoef":0,"trait":"line"},{"x":-368,"y":-163,"bCoef":0,"trait":"line"},{"x":350,"y":-171,"bCoef":0,"trait":"line"},{"x":368,"y":-163,"bCoef":0,"trait":"line"},{"x":-350,"y":171,"bCoef":0,"trait":"line"},{"x":-368,"y":163,"bCoef":0,"trait":"line"},{"x":350,"y":171,"bCoef":0,"trait":"line"},{"x":368,"y":163,"bCoef":0,"trait":"line"},{"x":368,"y":171,"bCoef":1,"trait":"ballArea"},{"x":368,"y":-171,"bCoef":1,"trait":"ballArea"},{"x":0,"y":171,"bCoef":0,"trait":"line"},{"x":0,"y":-171,"bCoef":0,"trait":"line"},{"x":0,"y":50,"trait":"kickOffBarrier"},{"x":0,"y":-50,"trait":"kickOffBarrier"},{"x":377,"y":-50,"bCoef":1,"cMask":["red"],"trait":"line"},{"x":377,"y":-171,"bCoef":1,"cMask":["ball"],"trait":"ballArea"},{"x":-377,"y":-50,"bCoef":1,"cMask":["blue"],"trait":"line"},{"x":-377,"y":-171,"bCoef":1,"cMask":["ball"],"trait":"ballArea"},{"x":-377,"y":50,"bCoef":1,"cMask":["blue"],"trait":"line"},{"x":-377,"y":171,"bCoef":1,"cMask":["ball"],"trait":"ballArea"},{"x":377,"y":50,"bCoef":1,"cMask":["red"],"trait":"line"},{"x":377,"y":171,"bCoef":1,"cMask":["ball"],"trait":"ballArea"}],"segments":[{"v0":0,"v1":1,"trait":"ballArea"},{"v0":2,"v1":3,"trait":"ballArea"},{"v0":4,"v1":5,"trait":"ballArea"},{"v0":6,"v1":7,"trait":"ballArea"},{"v0":8,"v1":9,"trait":"kickOffBarrier"},{"v0":9,"v1":10,"curve":180,"cGroup":["blueKO"],"trait":"kickOffBarrier"},{"v0":9,"v1":10,"curve":-180,"cGroup":["redKO"],"trait":"kickOffBarrier"},{"v0":10,"v1":11,"trait":"kickOffBarrier"},{"v0":2,"v1":12,"curve":-35,"vis":true,"color":"FFFFFF","bCoef":0.1,"cMask":["all"],"trait":"goalNet"},{"v0":6,"v1":13,"curve":35,"vis":true,"color":"FFFFFF","bCoef":0.1,"cMask":["all"],"trait":"goalNet"},{"v0":1,"v1":14,"curve":35,"vis":true,"color":"FFFFFF","bCoef":0.1,"cMask":["all"],"trait":"goalNet"},{"v0":5,"v1":15,"curve":-35,"vis":true,"color":"FFFFFF","bCoef":0.1,"cMask":["all"],"trait":"goalNet"},{"v0":12,"v1":14,"curve":-35,"vis":true,"color":"FFFFFF","bCoef":0.1,"cMask":["all"],"trait":"goalNet","x":-585},{"v0":13,"v1":15,"curve":35,"vis":true,"color":"FFFFFF","bCoef":0.1,"cMask":["all"],"trait":"goalNet","x":585},{"v0":1,"v1":0,"vis":true,"color":"FFFFFF","bCoef":1,"cMask":["ball"],"trait":"ballArea","x":-368},{"v0":5,"v1":4,"vis":true,"color":"FFFFFF","bCoef":1,"cMask":["ball"],"trait":"ballArea","x":368},{"v0":2,"v1":3,"vis":true,"color":"FFFFFF","bCoef":1,"cMask":["ball"],"trait":"ballArea","x":-368},{"v0":6,"v1":7,"vis":true,"color":"FFFFFF","bCoef":1,"cMask":["ball"],"trait":"ballArea","x":368},{"v0":0,"v1":28,"vis":true,"color":"FFFFFF","bCoef":1,"trait":"ballArea","y":171},{"v0":3,"v1":29,"vis":true,"color":"FFFFFF","bCoef":1,"trait":"ballArea","y":-171},{"v0":30,"v1":31,"curve":0,"vis":true,"color":"FFFFFF","bCoef":0,"trait":"line"},{"v0":10,"v1":9,"curve":-180,"vis":true,"color":"FFFFFF","bCoef":0,"trait":"line"},{"v0":33,"v1":32,"curve":180,"vis":true,"color":"FFFFFF","bCoef":0,"trait":"line"},{"v0":2,"v1":1,"curve":0,"vis":true,"color":"FFFFFF","bCoef":0,"trait":"line"},{"v0":6,"v1":5,"curve":0,"vis":true,"color":"FFFFFF","bCoef":0,"trait":"line"},{"v0":34,"v1":35,"vis":false,"color":"FFFFFF","bCoef":1,"cMask":["ball"],"trait":"ballArea","x":330},{"v0":36,"v1":37,"vis":false,"color":"FFFFFF","bCoef":1,"cMask":["ball"],"trait":"ballArea","x":-330},{"v0":38,"v1":39,"vis":false,"color":"FFFFFF","bCoef":1,"cMask":["ball"],"trait":"ballArea","x":-330},{"v0":40,"v1":41,"vis":false,"color":"FFFFFF","bCoef":1,"cMask":["ball"],"trait":"ballArea","x":330},{"v0":34,"v1":40,"curve":60,"vis":false,"color":"FFFFFF","bCoef":1,"cMask":["red"],"trait":"line"},{"v0":38,"v1":36,"curve":60,"vis":false,"color":"FFFFFF","bCoef":1,"cMask":["blue"],"trait":"line"}],"goals":[{"p0":[-372,-52],"p1":[-372,48],"team":"red"},{"p0":[372,50],"p1":[372,-50],"team":"blue"}],"discs":[{"radius":5,"pos":[-368,50],"color":"FFFFFF","trait":"goalPost"},{"radius":5,"pos":[-368,-50],"color":"FFFFFF","trait":"goalPost"},{"radius":5,"pos":[368,50],"color":"FFFFFF","trait":"goalPost"},{"radius":5,"pos":[368,-50],"color":"FFFFFF","trait":"goalPost"},{"radius":3,"invMass":0,"pos":[383,51],"color":"FFFFFF","bCoef":0,"trait":"line"},{"radius":3,"invMass":0,"pos":[-383,51],"color":"FFFFFF","bCoef":0,"trait":"line"},{"radius":3,"invMass":0,"pos":[383,-51],"color":"FFFFFF","bCoef":0,"trait":"line"},{"radius":3,"invMass":0,"pos":[-383,-51],"color":"FFFFFF","bCoef":0,"trait":"line"}],"planes":[{"normal":[0,1],"dist":-171,"trait":"ballArea"},{"normal":[0,-1],"dist":-171,"trait":"ballArea"},{"normal":[0,1],"dist":-200,"bCoef":0.2,"cMask":["all"]},{"normal":[0,-1],"dist":-200,"bCoef":0.2,"cMask":["all"]},{"normal":[1,0],"dist":-420,"bCoef":0.2,"cMask":["all"]},{"normal":[-1,0],"dist":-420,"bCoef":0.2,"cMask":["all"]}],"traits":{"ballArea":{"vis":false,"bCoef":1,"cMask":["ball"]},"goalPost":{"radius":8,"invMass":0,"bCoef":1},"goalNet":{"vis":true,"bCoef":0.1,"cMask":["all"]},"kickOffBarrier":{"vis":false,"bCoef":0.1,"cGroup":["redKO","blueKO"],"cMask":["red","blue"]},"line":{"vis":true,"bCoef":0,"cMask":[""]},"arco":{"radius":2,"cMask":["n\\/d"],"color":"cccccc"}},"playerPhysics":{"acceleration":0.11,"kickingAcceleration":0.1,"kickStrength":6.5},"ballPhysics":{"radius":6.4,"color":"C4FF03"}}',
  },
  {
    type: "sniper",
    players: 2 * 2,
    content:
      '{"name":"Sniper Shoot v3 by Jesus Navas from HaxMaps","width":425,"height":200,"spawnDistance":170,"bg":{"type":"hockey","width":0,"height":0,"kickOffRadius":0,"cornerRadius":0},"vertexes":[{"x":-370,"y":170,"trait":"ballArea"},{"x":-370,"y":-170,"trait":"ballArea"},{"x":370,"y":-170,"trait":"ballArea"},{"x":0,"y":-170,"trait":"kickOffBarrier","cMask":["wall"],"color":"f708ff"},{"x":-371,"y":-144,"trait":"goalNet","curve":-190,"color":"ff0000"},{"x":-375,"y":-105,"trait":"goalNet","curve":-190,"color":"ff0000"},{"x":370,"y":-143,"trait":"goalNet","curve":190,"color":"ff0000"},{"x":370,"y":-106,"trait":"goalNet","curve":190,"color":"ff0000"},{"x":-370,"y":-38,"trait":"goalNet","curve":-190,"bCoef":1,"color":"ffffff"},{"x":-374,"y":35,"trait":"goalNet","curve":-190,"color":"ffffff"},{"x":-375,"y":105,"trait":"goalNet","curve":-190,"color":"ff0000"},{"x":-371,"y":143,"trait":"goalNet","curve":-190,"color":"ff0000"},{"bCoef":0.1,"cMask":["blue"],"trait":"kickOffBarrier","x":50,"y":-200,"curve":0,"vis":true,"color":"000000","cGroup":["redKO"]},{"bCoef":0.1,"cMask":["blue"],"trait":"kickOffBarrier","x":50,"y":200,"curve":0,"vis":true,"color":"000000","cGroup":["redKO"]},{"x":370,"y":104,"trait":"goalNet","curve":190,"color":"ff0000"},{"x":370,"y":142,"trait":"goalNet","curve":190,"color":"ff0000"},{"x":370,"y":-37,"trait":"goalNet","curve":190,"color":"ffffff"},{"x":370,"y":39,"trait":"goalNet","curve":190,"color":"ffffff"},{"bCoef":1,"cMask":["ball"],"trait":"goalNet","x":370,"y":142,"curve":0,"vis":false},{"bCoef":1.4,"cMask":["ball"],"trait":"goalNet","x":370,"y":170,"curve":0,"vis":false,"color":"ffffff"},{"bCoef":1.5,"cMask":["ball"],"trait":"goalNet","x":-370,"y":146,"curve":0,"vis":false},{"bCoef":1.5,"cMask":["ball"],"trait":"goalNet","x":-370,"y":170,"curve":0,"vis":false},{"bCoef":1,"cMask":["ball"],"trait":"goalNet","x":-370,"y":145,"curve":0,"vis":false},{"bCoef":1.4,"cMask":["ball"],"trait":"goalNet","x":-370,"y":170,"curve":0,"vis":false,"color":"ffffff"},{"bCoef":1,"trait":"goalPost","x":-370,"y":-103,"cMask":["ball"],"curve":1},{"bCoef":1,"trait":"goalPost","x":-371,"y":-34,"cMask":["ball"],"curve":1},{"bCoef":1.4,"cMask":["ball"],"trait":"goalNet","x":-370,"y":-170,"color":"ffffff"},{"bCoef":1.5,"cMask":["ball"],"trait":"goalPost","x":-371,"y":-143},{"bCoef":1,"cMask":["ball"],"trait":"goalNet","x":-370,"y":37,"color":"ffffff"},{"bCoef":1,"cMask":["ball"],"trait":"goalNet","x":-370,"y":99,"color":"ffffff"},{"bCoef":1.4,"cMask":["ball"],"trait":"goalNet","x":370,"y":-170,"color":"ffffff"},{"bCoef":1.52,"cMask":["ball"],"trait":"goalPost","x":370,"y":-145},{"bCoef":1,"cMask":["ball"],"trait":"goalPost","x":370,"y":-104},{"bCoef":1,"cMask":["ball"],"trait":"goalPost","x":371,"y":-37},{"bCoef":0.1,"cMask":["red"],"trait":"goalPost","x":-50,"y":-200,"curve":0,"vis":true,"color":"000000","cGroup":["blueKO"]},{"bCoef":0.1,"cMask":["red"],"trait":"goalPost","x":-50,"y":200,"curve":0,"vis":true,"color":"000000","cGroup":["blueKO"]},{"bCoef":1,"trait":"goalNet","x":370,"y":-152,"color":"ffffff"},{"cMask":["ball"],"x":-370,"y":-152,"color":"ffffff","bCoef":1,"trait":"goalNet"},{"bCoef":1,"cMask":["ball"],"trait":"goalNet","x":-370,"y":-95,"color":"000000"},{"cMask":["ball"],"trait":"goalNet","x":370,"y":152,"bCoef":1,"color":"ffffff"},{"bCoef":1,"trait":"goalNet","x":370,"y":-96,"color":"ffffff"},{"bCoef":1,"trait":"goalNet","x":370,"y":-44,"color":"ffffff"},{"bCoef":1,"trait":"goalNet","x":-370,"y":153,"color":"ffffff"},{"bCoef":1,"trait":"goalNet","x":370,"y":49,"color":"ffffff"},{"bCoef":1,"trait":"goalNet","x":370,"y":96,"color":"ffffff"},{"bCoef":0.1,"x":0,"y":170,"cMask":["wall"],"color":"f708ff"},{"x":-370,"y":-144,"trait":"goalNet","curve":0,"vis":false},{"x":-370,"y":-105,"trait":"goalNet","curve":0,"vis":false},{"x":-370,"y":-38,"trait":"goalNet","curve":0,"bCoef":1,"color":"000000","vis":false},{"x":-370,"y":35,"trait":"goalNet","curve":0,"vis":false},{"x":-370,"y":105,"trait":"goalNet","curve":0,"vis":false},{"x":-370,"y":143,"trait":"goalNet","curve":0,"vis":false},{"bCoef":0.1,"cMask":["red"],"trait":"goalPost","x":50,"y":-200,"curve":0,"vis":true,"color":"08FFD6","cGroup":["red"]},{"bCoef":0.1,"cMask":["red"],"trait":"goalPost","x":50,"y":200,"curve":0,"vis":true,"color":"08FFD6","cGroup":["red"]},{"bCoef":0.1,"cMask":["blue"],"trait":"goalPost","x":-50,"y":-200,"curve":0,"vis":true,"color":"08FFD6","cGroup":["blue"]},{"bCoef":0.1,"cMask":["blue"],"trait":"goalPost","x":-50,"y":200,"curve":0,"vis":true,"color":"08FFD6","cGroup":["blue"]}],"segments":[{"v0":4,"v1":5,"trait":"goalNet","curve":-190,"color":"ff0000"},{"v0":6,"v1":7,"trait":"goalNet","curve":190,"x":370,"color":"ff0000"},{"v0":8,"v1":9,"trait":"goalNet","curve":-190,"color":"ffffff"},{"v0":10,"v1":11,"trait":"goalNet","curve":-190,"color":"ff0000"},{"curve":0,"vis":true,"color":"000000","bCoef":0.1,"cMask":["blue"],"trait":"kickOffBarrier","v0":12,"v1":13,"cGroup":["redKO"]},{"v0":14,"v1":15,"trait":"goalNet","curve":190,"x":370,"color":"ff0000"},{"v0":16,"v1":17,"trait":"goalNet","curve":190,"x":370,"color":"ffffff"},{"curve":0,"vis":false,"color":"FFCCCC","bCoef":1,"cMask":["ball"],"trait":"goalNet","v0":18,"v1":19},{"curve":0,"vis":false,"color":"FFCCCC","bCoef":1.5,"cMask":["ball"],"trait":"goalNet","v0":20,"v1":21},{"curve":0,"vis":false,"color":"FFCCCC","bCoef":1,"cMask":["ball"],"trait":"goalNet","v0":22,"v1":23},{"curve":1,"vis":false,"color":"FFCCCC","bCoef":1,"trait":"goalPost","v0":24,"v1":25,"cMask":["ball"]},{"curve":0,"vis":false,"color":"FFCCCC","bCoef":1,"cMask":["ball"],"trait":"goalPost","v0":28,"v1":29},{"curve":0,"vis":false,"color":"FFCCCC","bCoef":1,"cMask":["ball"],"trait":"goalPost","v0":32,"v1":33},{"curve":0,"vis":true,"color":"000000","bCoef":0.1,"cMask":["red"],"trait":"goalPost","v0":34,"v1":35,"cGroup":["blueKO"]},{"vis":true,"bCoef":1,"trait":"goalNet","v0":30,"v1":36,"color":"ffffff","x":370},{"vis":true,"cMask":["ball"],"v0":26,"v1":37,"color":"ffffff","bCoef":1,"trait":"goalNet","x":-370},{"curve":0,"vis":true,"color":"000000","bCoef":1,"cMask":["ball"],"trait":"goalNet","v0":38,"v1":8,"x":-370},{"curve":0,"vis":true,"color":"ffffff","cMask":["ball"],"trait":"goalNet","v0":39,"v1":19,"bCoef":1,"x":370},{"curve":0,"vis":true,"color":"ffffff","bCoef":1,"trait":"goalNet","v0":28,"v1":29,"cMask":["ball"],"x":-370},{"curve":0,"vis":true,"color":"ffffff","bCoef":1,"trait":"goalNet","v0":40,"v1":41,"x":370},{"curve":0,"vis":true,"color":"ffffff","bCoef":1,"trait":"goalNet","v0":42,"v1":23,"x":-370},{"curve":0,"vis":true,"color":"ffffff","bCoef":1,"trait":"goalNet","v0":43,"v1":44,"x":370},{"curve":0,"vis":true,"color":"ffffff","bCoef":1.4,"cMask":["ball"],"trait":"goalNet","v0":23,"v1":19},{"curve":0,"vis":true,"color":"ffffff","bCoef":1.4,"cMask":["ball"],"trait":"goalNet","v0":26,"v1":30},{"vis":true,"color":"f708ff","bCoef":0.1,"v0":3,"v1":45,"x":0,"cMask":["wall"],"curve":1.50571568977},{"curve":0,"vis":true,"color":"08FFD6","bCoef":0.1,"cMask":["red"],"trait":"goalPost","v0":52,"v1":53,"cGroup":["red"]},{"curve":0,"vis":true,"color":"08FFD6","bCoef":0.1,"cMask":["blue"],"trait":"goalPost","v0":54,"v1":55,"cGroup":["blue"]}],"goals":[{"p0":[-369,-146],"p1":[-369,-102],"team":"red","color":"000000","x":-370},{"p0":[370,-110],"p1":[370,-150],"team":"blue","x":370,"color":"000000"},{"p0":[-370,-35],"p1":[-370,35],"team":"red","color":"000000","x":-370},{"p0":[-370,103],"p1":[-370,143],"team":"red","color":"000000","x":-370},{"p0":[370,143],"p1":[370,98],"team":"blue","x":370,"color":"000000"},{"p0":[370,35],"p1":[370,-35],"team":"blue","x":370,"color":"000000"}],"discs":[{"pos":[-370,-105],"trait":"goalPost","color":"ffffff","bCoef":0.5},{"pos":[-370,-144],"trait":"goalPost","color":"ffffff","bCoef":0.5},{"pos":[370,-105],"trait":"goalPost","color":"ffffff","bCoef":0.5},{"pos":[370,-143],"trait":"goalPost","color":"ffffff","bCoef":0.5},{"pos":[-370,35],"trait":"goalPost","color":"ff0000","bCoef":0.5},{"pos":[-370,-35],"trait":"goalPost","color":"ff0000","bCoef":0.5},{"pos":[-370,143],"trait":"goalPost","color":"ffffff","bCoef":0.5},{"pos":[-370,105],"trait":"goalPost","color":"ffffff","bCoef":0.5},{"pos":[370,143],"trait":"goalPost","color":"ffffff","bCoef":0.5},{"pos":[370,104],"trait":"goalPost","color":"ffffff","bCoef":0.5},{"pos":[370,41],"trait":"goalPost","color":"ff0000","bCoef":0.5},{"pos":[370,-35],"trait":"goalPost","color":"ff0000","bCoef":0.5}],"planes":[{"normal":[0,-1],"dist":-170,"trait":"ballArea","bCoef":1},{"normal":[0,1],"dist":-170,"bCoef":1,"cMask":["ball"],"trait":"ballArea"},{"normal":[1,0],"dist":-423.311779142,"bCoef":0.1},{"normal":[-1,0],"dist":-423.310955619,"bCoef":0.1},{"bCoef":0.1,"dist":-200,"normal":[0,-1]},{"bCoef":0.1,"dist":-200,"normal":[0,1]}],"traits":{"ballArea":{"vis":false,"bCoef":1,"cMask":["ball"]},"goalPost":{"radius":8,"invMass":0,"bCoef":0.5},"goalNet":{"vis":true,"bCoef":0.1,"cMask":["ball"]},"kickOffBarrier":{"vis":false,"bCoef":0.1,"cGroup":["redKO","blueKO"],"cMask":["red","blue"]}},"playerPhysics":{"bCoef":0.5,"invMass":0.5,"damping":0.96,"acceleration":0.12,"kickingAcceleration":0.12,"kickingDamping":0.96,"kickStrength":13},"ballPhysics":{"color":"FFFF0D","radius":10}}',
  },
  {
    type: "training",
    players: 4 * 4,
    content:
      '{"name":":\u0131 v4 futsal training by valn [\u029c\u1d00x\u1d0d\u1d0f\u1d05s.\u1d04\u1d0f\u1d0d]","width":460,"height":260,"bg":{"kickOffRadius":45,"color":"34414B"},"vertexes":[{"x":-46,"y":-230,"cMask":["c1"],"cGroup":["c0"]},{"x":-47,"y":-231,"cMask":["c1"],"cGroup":["c0"]},{"x":-398,"y":-230,"cMask":["c1"],"cGroup":["c0"]},{"x":-397,"y":-231,"cMask":["c1"],"cGroup":["c0"]},{"x":-398,"y":-30,"cMask":["c1"],"cGroup":["c0"]},{"x":-397,"y":-29,"cMask":["c1"],"cGroup":["c0"]},{"x":-46,"y":-30,"cMask":["c1"],"cGroup":["c0"]},{"x":-47,"y":-29,"cMask":["c1"],"cGroup":["c0"]},{"x":-222,"y":-230.5,"cMask":[]},{"x":-222,"y":-175,"cMask":[]},{"x":-222,"y":-175,"cMask":[]},{"x":-222,"y":-85,"cMask":[]},{"x":-222,"y":-85,"cMask":[]},{"x":-222,"y":-29.5,"cMask":[]},{"x":-222,"y":-128.5,"cMask":[]},{"x":-222,"y":-131.5,"cMask":[]},{"x":400,"y":-230,"cMask":["c1"],"cGroup":["c0"]},{"x":399,"y":-231,"cMask":["c1"],"cGroup":["c0"]},{"x":48,"y":-230,"cMask":["c1"],"cGroup":["c0"]},{"x":49,"y":-231,"cMask":["c1"],"cGroup":["c0"]},{"x":48,"y":-30,"cMask":["c1"],"cGroup":["c0"]},{"x":49,"y":-29,"cMask":["c1"],"cGroup":["c0"]},{"x":400,"y":-30,"cMask":["c1"],"cGroup":["c0"]},{"x":399,"y":-29,"cMask":["c1"],"cGroup":["c0"]},{"x":224,"y":-230.5,"cMask":[]},{"x":224,"y":-175,"cMask":[]},{"x":224,"y":-175,"cMask":[]},{"x":224,"y":-85,"cMask":[]},{"x":224,"y":-85,"cMask":[]},{"x":224,"y":-29.5,"cMask":[]},{"x":224,"y":-128.5,"cMask":[]},{"x":224,"y":-131.5,"cMask":[]},{"x":-46,"y":230,"cMask":["c1"],"cGroup":["c0"],"bias":-10},{"x":-47,"y":231,"cMask":["c1"],"cGroup":["c0"],"bias":-10},{"x":-398,"y":230,"cMask":["c1"],"cGroup":["c0"],"bias":-10},{"x":-397,"y":231,"cMask":["c1"],"cGroup":["c0"],"bias":-10},{"x":-398,"y":30,"cMask":["c1"],"cGroup":["c0"],"bias":-10},{"x":-397,"y":29,"cMask":["c1"],"cGroup":["c0"],"bias":-10},{"x":-46,"y":30,"cMask":["c1"],"cGroup":["c0"],"bias":-10},{"x":-47,"y":29,"cMask":["c1"],"cGroup":["c0"],"bias":-10},{"x":-222,"y":230.5,"cMask":[]},{"x":-222,"y":175,"cMask":[]},{"x":-222,"y":175,"cMask":[]},{"x":-222,"y":85,"cMask":[]},{"x":-222,"y":85,"cMask":[]},{"x":-222,"y":29.5,"cMask":[]},{"x":-222,"y":128.5,"cMask":[]},{"x":-222,"y":131.5,"cMask":[]},{"x":400,"y":230,"cMask":["c1"],"cGroup":["c0"],"bias":-10},{"x":399,"y":231,"cMask":["c1"],"cGroup":["c0"],"bias":-10},{"x":48,"y":230,"cMask":["c1"],"cGroup":["c0"],"bias":-10},{"x":49,"y":231,"cMask":["c1"],"cGroup":["c0"],"bias":-10},{"x":48,"y":30,"cMask":["c1"],"cGroup":["c0"],"bias":-10},{"x":49,"y":29,"cMask":["c1"],"cGroup":["c0"],"bias":-10},{"x":400,"y":30,"cMask":["c1"],"cGroup":["c0"],"bias":-10},{"x":399,"y":29,"cMask":["c1"],"cGroup":["c0"],"bias":-10},{"x":224,"y":230.5,"cMask":[]},{"x":224,"y":175,"cMask":[]},{"x":224,"y":175,"cMask":[]},{"x":224,"y":85,"cMask":[]},{"x":224,"y":85,"cMask":[]},{"x":224,"y":29.5,"cMask":[]},{"x":224,"y":128.5,"cMask":[]},{"x":224,"y":131.5,"cMask":[]},{"x":-6.886986843506499,"y":-13.499803369768236,"cMask":["wall"],"cGroup":["wall"],"color":"646D87"},{"x":-6.886986843506499,"y":-6.347047433548922,"cMask":["wall"],"cGroup":["wall"],"color":"646D87"},{"x":-6.886986843506499,"y":-13.022952974020285,"cMask":["wall"],"cGroup":["wall"],"color":"646D87"},{"x":-6.886986843506499,"y":-6.823897829296881,"cMask":["wall"],"cGroup":["wall"],"color":"646D87"},{"x":-6.886986843506499,"y":12.976226461093518,"cMask":["wall"],"cGroup":["wall"],"color":"646D87"},{"x":-6.886986843506499,"y":5.823470524874198,"cMask":["wall"],"cGroup":["wall"],"color":"646D87"},{"x":-6.886986843506499,"y":12.499376065345563,"cMask":["wall"],"cGroup":["wall"],"color":"646D87"},{"x":-6.886986843506499,"y":6.300320920622165,"cMask":["wall"],"cGroup":["wall"],"color":"646D87"},{"x":5.102090591138096,"y":-14.761112220753297,"cMask":["wall"],"cGroup":["wall"],"color":"646D87"},{"x":5.102090591138096,"y":14.312400558259872,"cMask":["wall"],"cGroup":["wall"],"color":"646D87"},{"x":5.701544462870328,"y":-14.761112220753297,"cMask":["wall"],"cGroup":["wall"],"color":"646D87"},{"x":5.701544462870328,"y":14.312400558259872,"cMask":["wall"],"cGroup":["wall"],"color":"646D87"},{"x":6.300998334602561,"y":-14.761112220753297,"cMask":["wall"],"cGroup":["wall"],"color":"646D87"},{"x":6.300998334602561,"y":14.312400558259872,"cMask":["wall"],"cGroup":["wall"],"color":"646D87"},{"x":6.900452206334792,"y":-14.761112220753297,"cMask":["wall"],"cGroup":["wall"],"color":"646D87"},{"x":6.900452206334792,"y":14.312400558259872,"cMask":["wall"],"cGroup":["wall"],"color":"646D87"},{"x":7.499906078067025,"y":-14.761112220753297,"cMask":["wall"],"cGroup":["wall"],"color":"646D87"},{"x":7.499906078067025,"y":14.312400558259872,"cMask":["wall"],"cGroup":["wall"],"color":"646D87"},{"x":8.099359949799243,"y":-14.761112220753297,"cMask":["wall"],"cGroup":["wall"],"color":"646D87"},{"x":8.099359949799243,"y":14.312400558259872,"cMask":["wall"],"cGroup":["wall"],"color":"646D87"},{"x":-6.79422514619883,"y":-11.854166666666666,"cMask":["wall"],"cGroup":["wall"],"curve":30,"color":"646D87"},{"x":-6.79422514619883,"y":-8.10562865497076,"cMask":["wall"],"cGroup":["wall"],"curve":30,"color":"646D87"},{"x":-6.79422514619883,"y":7.637061403508772,"cMask":["wall"],"cGroup":["wall"],"curve":30,"color":"646D87"},{"x":-6.79422514619883,"y":11.385599415204679,"cMask":["wall"],"cGroup":["wall"],"curve":30,"color":"646D87"}],"segments":[{"v0":0,"v1":2,"color":"151A1E","cMask":["c1"],"cGroup":["c0"],"bias":10,"y":-100},{"v0":3,"v1":5,"color":"151A1E","cMask":["c1"],"cGroup":["c0"],"bias":10,"x":-425},{"v0":4,"v1":6,"color":"151A1E","cMask":["c1"],"cGroup":["c0"],"bias":10,"y":100},{"v0":7,"v1":1,"color":"151A1E","cMask":["c1"],"cGroup":["c0"],"bias":10,"x":-75},{"v0":8,"v1":9,"color":"151A1E","cMask":[],"x":-250},{"v0":12,"v1":13,"color":"151A1E","cMask":[],"x":-250},{"v0":10,"v1":11,"curve":180,"color":"151A1E","cMask":[],"curveF":6.123233995736766e-17,"x":-250},{"v0":11,"v1":10,"curve":180,"color":"151A1E","cMask":[],"curveF":6.123233995736766e-17,"x":-250},{"v0":14,"v1":15,"curve":180,"color":"151A1E","cMask":[],"curveF":6.123233995736766e-17,"x":-250},{"v0":15,"v1":14,"curve":180,"color":"151A1E","cMask":[],"curveF":6.123233995736766e-17,"x":-250},{"v0":16,"v1":18,"color":"151A1E","cMask":["c1"],"cGroup":["c0"],"bias":10,"y":-100},{"v0":19,"v1":21,"color":"151A1E","cMask":["c1"],"cGroup":["c0"],"bias":10,"x":75},{"v0":20,"v1":22,"color":"151A1E","cMask":["c1"],"cGroup":["c0"],"bias":10,"y":100},{"v0":23,"v1":17,"color":"151A1E","cMask":["c1"],"cGroup":["c0"],"bias":10,"x":425},{"v0":24,"v1":25,"color":"151A1E","cMask":[],"x":250},{"v0":28,"v1":29,"color":"151A1E","cMask":[],"x":250},{"v0":26,"v1":27,"curve":180,"color":"151A1E","cMask":[],"curveF":6.123233995736766e-17,"x":250},{"v0":27,"v1":26,"curve":180,"color":"151A1E","cMask":[],"curveF":6.123233995736766e-17,"x":250},{"v0":30,"v1":31,"curve":180,"color":"151A1E","cMask":[],"curveF":6.123233995736766e-17,"x":250},{"v0":31,"v1":30,"curve":180,"color":"151A1E","cMask":[],"curveF":6.123233995736766e-17,"x":250},{"v0":32,"v1":34,"color":"151A1E","cMask":["c1"],"cGroup":["c0"],"bias":-10,"y":-100},{"v0":35,"v1":37,"color":"151A1E","cMask":["c1"],"cGroup":["c0"],"bias":-10,"x":-425},{"v0":36,"v1":38,"color":"151A1E","cMask":["c1"],"cGroup":["c0"],"bias":-10,"y":100},{"v0":39,"v1":33,"color":"151A1E","cMask":["c1"],"cGroup":["c0"],"bias":-10,"x":-75},{"v0":40,"v1":41,"color":"151A1E","cMask":[],"x":-250},{"v0":44,"v1":45,"color":"151A1E","cMask":[],"x":-250},{"v0":42,"v1":43,"curve":-180,"color":"151A1E","cMask":[],"curveF":6.123233995736766e-17,"x":-250},{"v0":43,"v1":42,"curve":-180,"color":"151A1E","cMask":[],"curveF":6.123233995736766e-17,"x":-250},{"v0":46,"v1":47,"curve":-180,"color":"151A1E","cMask":[],"curveF":6.123233995736766e-17,"x":-250},{"v0":47,"v1":46,"curve":-180,"color":"151A1E","cMask":[],"curveF":6.123233995736766e-17,"x":-250},{"v0":48,"v1":50,"color":"151A1E","cMask":["c1"],"cGroup":["c0"],"bias":-10,"y":-100},{"v0":51,"v1":53,"color":"151A1E","cMask":["c1"],"cGroup":["c0"],"bias":-10,"x":75},{"v0":52,"v1":54,"color":"151A1E","cMask":["c1"],"cGroup":["c0"],"bias":-10,"y":100},{"v0":55,"v1":49,"color":"151A1E","cMask":["c1"],"cGroup":["c0"],"bias":-10,"x":425},{"v0":56,"v1":57,"color":"151A1E","cMask":[],"x":250},{"v0":60,"v1":61,"color":"151A1E","cMask":[],"x":250},{"v0":58,"v1":59,"curve":-180,"color":"151A1E","cMask":[],"curveF":6.123233995736766e-17,"x":250},{"v0":59,"v1":58,"curve":-180,"color":"151A1E","cMask":[],"curveF":6.123233995736766e-17,"x":250},{"v0":62,"v1":63,"curve":-180,"color":"151A1E","cMask":[],"curveF":6.123233995736766e-17,"x":250},{"v0":63,"v1":62,"curve":-180,"color":"151A1E","cMask":[],"curveF":6.123233995736766e-17,"x":250},{"v0":64,"v1":65,"curve":180,"color":"646D87","cMask":["wall"],"cGroup":["wall"],"x":-10},{"v0":65,"v1":64,"curve":180,"color":"646D87","cMask":["wall"],"cGroup":["wall"],"x":-10},{"v0":66,"v1":67,"curve":180,"color":"646D87","cMask":["wall"],"cGroup":["wall"],"x":-10},{"v0":67,"v1":66,"curve":180,"color":"646D87","cMask":["wall"],"cGroup":["wall"],"x":-10},{"v0":68,"v1":69,"curve":-180,"color":"646D87","cMask":["wall"],"cGroup":["wall"],"x":-10},{"v0":69,"v1":68,"curve":-180,"color":"646D87","cMask":["wall"],"cGroup":["wall"],"x":-10},{"v0":70,"v1":71,"curve":-180,"color":"646D87","cMask":["wall"],"cGroup":["wall"],"x":-10},{"v0":71,"v1":70,"curve":-180,"color":"646D87","cMask":["wall"],"cGroup":["wall"],"x":-10},{"v0":72,"v1":73,"color":"646D87","cMask":["wall"],"cGroup":["wall"],"x":30},{"v0":74,"v1":75,"color":"646D87","cMask":["wall"],"cGroup":["wall"],"x":32},{"v0":76,"v1":77,"color":"646D87","cMask":["wall"],"cGroup":["wall"],"x":34},{"v0":78,"v1":79,"color":"646D87","cMask":["wall"],"cGroup":["wall"],"x":36},{"v0":80,"v1":81,"color":"646D87","cMask":["wall"],"cGroup":["wall"],"x":38},{"v0":82,"v1":83,"color":"646D87","cMask":["wall"],"cGroup":["wall"],"x":40},{"v0":84,"v1":85,"curve":180,"color":"646D87","cMask":["wall"],"cGroup":["wall"],"x":-40},{"v0":85,"v1":84,"curve":180,"color":"646D87","cMask":["wall"],"cGroup":["wall"],"x":-40},{"v0":84,"v1":85,"curve":120,"color":"646D87","cMask":["wall"],"cGroup":["wall"]},{"v0":85,"v1":84,"curve":120,"color":"646D87","cMask":["wall"],"cGroup":["wall"]},{"v0":84,"v1":85,"curve":150,"color":"646D87","cMask":["wall"],"cGroup":["wall"]},{"v0":85,"v1":84,"curve":150,"color":"646D87","cMask":["wall"],"cGroup":["wall"]},{"v0":84,"v1":85,"curve":90,"color":"646D87","cMask":["wall"],"cGroup":["wall"]},{"v0":85,"v1":84,"curve":90,"color":"646D87","cMask":["wall"],"cGroup":["wall"]},{"v0":84,"v1":85,"curve":60,"color":"646D87","cMask":["wall"],"cGroup":["wall"]},{"v0":85,"v1":84,"curve":60,"color":"646D87","cMask":["wall"],"cGroup":["wall"]},{"v0":84,"v1":85,"curve":30,"color":"646D87","cMask":["wall"],"cGroup":["wall"]},{"v0":85,"v1":84,"curve":30,"color":"646D87","cMask":["wall"],"cGroup":["wall"]},{"v0":86,"v1":87,"curve":180,"color":"646D87","cMask":["wall"],"cGroup":["wall"],"x":-40},{"v0":87,"v1":86,"curve":180,"color":"646D87","cMask":["wall"],"cGroup":["wall"],"x":-40},{"v0":86,"v1":87,"curve":120,"color":"646D87","cMask":["wall"],"cGroup":["wall"]},{"v0":87,"v1":86,"curve":120,"color":"646D87","cMask":["wall"],"cGroup":["wall"]},{"v0":86,"v1":87,"curve":150,"color":"646D87","cMask":["wall"],"cGroup":["wall"]},{"v0":87,"v1":86,"curve":150,"color":"646D87","cMask":["wall"],"cGroup":["wall"]},{"v0":86,"v1":87,"curve":90,"color":"646D87","cMask":["wall"],"cGroup":["wall"]},{"v0":87,"v1":86,"curve":90,"color":"646D87","cMask":["wall"],"cGroup":["wall"]},{"v0":86,"v1":87,"curve":60,"color":"646D87","cMask":["wall"],"cGroup":["wall"]},{"v0":87,"v1":86,"curve":60,"color":"646D87","cMask":["wall"],"cGroup":["wall"]},{"v0":86,"v1":87,"curve":30,"color":"646D87","cMask":["wall"],"cGroup":["wall"]},{"v0":87,"v1":86,"curve":30,"color":"646D87","cMask":["wall"],"cGroup":["wall"]}],"planes":[],"goals":[],"discs":[{"radius":5.8,"invMass":1.5,"pos":[-222,-130],"color":"FFF26D","bCoef":0.412,"cMask":["red","blue","wall","c0"],"cGroup":["ball","kick","c1"]},{"radius":5.8,"invMass":1.5,"pos":[224,-130],"color":"FFF26D","bCoef":0.412,"cMask":["red","blue","wall","c0"],"cGroup":["ball","kick","c1"]},{"radius":5.8,"invMass":1.5,"pos":[-222,130],"color":"FFF26D","bCoef":0.412,"cMask":["red","blue","wall","c0"],"cGroup":["ball","kick","c1"]},{"radius":5.8,"invMass":1.5,"pos":[224,130],"color":"FFF26D","bCoef":0.412,"cMask":["red","blue","wall","c0"],"cGroup":["ball","kick","c1"]}],"playerPhysics":{"bCoef":0,"acceleration":0.11,"kickingAcceleration":0.083,"kickStrength":4.2},"ballPhysics":{"radius":1.0e-42,"invMass":1.0e-42,"color":"FFF26D","bCoef":1.0e-42,"cGroup":["wall"],"gravity":[0,1.0e-42],"damping":1.0e-42,"cMask":["wall"]},"traits":[],"joints":[],"redSpawnPoints":[],"blueSpawnPoints":[],"canBeStored":true,"cameraFollow":"player"}',
  },
];
