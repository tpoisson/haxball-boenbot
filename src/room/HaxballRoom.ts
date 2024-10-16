import IChatCommand from "../models/IChatCommand";
import { ICurrentGame } from "../models/ICurrentGame";
import { OffsidePlugin } from "../plugins/off-side";
import RoomPlugin from "./room-plugin";
import { BlinkOnGoalPlugin } from "../plugins/blink-on-goal";
import { IdlePlayerPlugin } from "../plugins/idle-player";
import { PowerShotPlugin } from "../plugins/power-shot";
import { pointDistance } from "../utils/common";
import { BallPossession } from "../plugins/ball-possession";
import { TrollAnnouncementPlugin } from "../plugins/troll-announcement";
import { GoalAnnouncementPlugin } from "../plugins/goal-announcement";
import { PlayerStatsPlugin } from "../plugins/player-stats";
import { ChatCommandsPlugin } from "../plugins/chat-commands";
// import { RecordMatchPlugin } from "../plugins/record-match";
import { StadiumPlugin } from "../plugins/stadium";

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
  private readonly chatCommands: IChatCommand[] = [
    {
      name: "See all chat commands",
      commands: ["!help"],
      admin: false,
      method: (msg, player) => {
        this.room.sendAnnouncement(
          this.chatCommands.map((chatCommand) => `${chatCommand.name} : ${chatCommand.commands.join(", ")}`).join("\n"),
          player.id,
        );
        return false;
      },
    },
    {
      name: "Apply room default settings",
      commands: ["!default", "!ds"],
      admin: true,
      method: (msg, player) => {
        this.room.stopGame();
        this.applyDefaultSettings();
        return false;
      },
    },
  ];

  private readonly room: RoomObject;

  private distanceSensitivity = 1.1; // Percentage of distance

  private currentGame?: ICurrentGame;

  private scoring = new Array<PlayerScoreObject>();

  private hasKickedOff = false;

  private roomConfig: { ballRadius?: number; playerRadius?: number } = {};

  private readonly plugins = new Array<RoomPlugin>();

  constructor() {
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
    this.applyDefaultSettings();

    // Game Lifecycle
    this.room.onGameStart = (byPlayer) => {
      this.scoring = [];
      this.hasKickedOff = false;
      this.plugins.forEach((plugin) => plugin.onGameKickoffReset());

      this.roomConfig.ballRadius = this.room.getDiscProperties(0).radius;
      this.currentGame = {};
      const player = this.room.getPlayerList().find((p) => p.team > 0);
      if (player) {
        this.roomConfig.playerRadius = this.room.getPlayerDiscProperties(player.id)?.radius;
      }
      this.plugins.forEach((plugin) => plugin.onGameStart(byPlayer));
    };
    this.room.onGameStop = (byPlayer) => {
      this.plugins.forEach((plugin) => plugin.onGameOff());
      this.plugins.forEach((plugin) => plugin.onGameStop(byPlayer));
    };
    this.room.onGamePause = (byPlayer) => {
      this.plugins.forEach((plugin) => plugin.onGameOff());
      this.plugins.forEach((plugin) => plugin.onGamePause(byPlayer));
    };
    this.room.onGameUnpause = (byPlayer) => {
      this.plugins.forEach((plugin) => plugin.onGameOn());
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
      this.plugins.forEach((plugin) => plugin.onGameOff());
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
      this.plugins.forEach((plugin) => plugin.onGameOff());
      this.plugins.forEach((plugin) => plugin.onTeamVictory(this.scoring));
    };
    this.room.onPositionsReset = () => {
      this.hasKickedOff = false;
      this.plugins.forEach((plugin) => plugin.onGameKickoffReset());
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
      this.plugins.forEach((plugin) => plugin.onPlayerJoin(newPlayer));
      this.plugins.forEach((plugin) => plugin.playerListChanged(newPlayer));
    };

    this.room.onPlayerLeave = (leavingPlayer) => {
      this.plugins.forEach((plugin) => plugin.onPlayerLeave(leavingPlayer));
      this.plugins.forEach((plugin) => plugin.playerListChanged(leavingPlayer));
    };

    this.room.onPlayerBallKick = (player) => {
      if (this.hasKickedOff === false) {
        this.hasKickedOff = true;
        this.plugins.forEach((plugin) => plugin.onGameKickoff(player));
        this.plugins.forEach((plugin) => plugin.onGameOn());
      }
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
          return command.method(msg, player);
        } else {
          this.room.sendChat("This command does not exist, noob", player.id);
        }
        return false;
      }
      return true;
    };
  }

  private applyDefaultSettings() {
    this.room.setScoreLimit(3);
    this.room.setTimeLimit(5);
    // https://haxcolors.com/
    this.room.setTeamColors(1, 45, 0xffffff, [0xe16d54, 0xe18446, 0xe15a31]);
    this.room.setTeamColors(2, 45, 0xffffff, [0x669ce2, 0x548be2, 0x0080ff]);
    this.room.setKickRateLimit(2, 0, 0);
    this.room.sendAnnouncement("Default settings applied !");
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
      new PlayerStatsPlugin(this.room),
      // new RecordMatchPlugin(this.room),
      new StadiumPlugin(this.room),
      new ChatCommandsPlugin(this.room),
    ].forEach((plugin) => {
      this.chatCommands.push(...plugin.getChatsCommands());
      this.plugins.push(plugin);
    });

    const openDbRequest = window.indexedDB.open("haxball");
    return new Promise((resolve, reject) => {
      openDbRequest.onerror = (event) => {
        console.error("dbRequest error", event);
        reject(event.target);
      };
      openDbRequest.onupgradeneeded = async (ev) => {
        console.info("DB Upgrade needed !");
        const db = openDbRequest.result;

        this.plugins.map((plugin) => {
          plugin.onDatabaseUpgradeNeeded(db);
        });
      };
      openDbRequest.onsuccess = () => {
        console.info("DB initialized !");
        const db = openDbRequest.result;
        db.onerror = (event) => {
          console.error(`Database error: ${event.target}`);
        };

        this.plugins.map((plugin) => {
          plugin.onDatabaseConnectionSuccess(db);
        });

        resolve(db);
      };
    });
  }

  private getTriggerDistance(playerId: number) {
    const playerRadius = this.room.getPlayerDiscProperties(playerId).radius;
    return (this.roomConfig.ballRadius! + playerRadius) * this.distanceSensitivity;
  }
}
