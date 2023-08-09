import IChatCommand from "../models/IChatCommand";
import RoomPlugin from "../room/room-plugin";

export class PowerShotPlugin extends RoomPlugin {
  private readonly powerShotConfig = {
    enabled: false,
    timeout: 60 * 2, // This means 2 seconds.
    powerCoefficient: 2, // Original ball kick speed would be multiplied by this number when power shot is activated.
  };

  private ballColor?: number;

  private powerShotAvailable = false;
  private hasKickedOff = false;
  private gameOn = false;
  private playerTouchingBall?: PlayerObject;

  private timePlayerBallTouch: number = 0;

  public onGameStart(byPlayer: PlayerObject): void {
    this.ballColor = this.room.getDiscProperties(0).color;
  }

  public onGameOn(): void {
    this.gameOn = true;
  }

  public onGameOff(): void {
    this.gameOn = false;
  }

  public onGameKickoff(byPlayer: PlayerObject): void {
    this.hasKickedOff = true;
  }

  public onGameKickoffReset(): void {
    this.hasKickedOff = false;
  }

  public override onPlayerJoin(newPlayer: PlayerObject): void {
    this.room.sendAnnouncement(`🚀 - ${this.powerShotConfig.enabled ? "Powershot enabled ✅" : "Powershot disabled ❌"}`, newPlayer.id, undefined, undefined, 0);
  }

  public onPlayerBallKick(byPlayer: PlayerObject): void {
    if (this.playerTouchingBall?.id === byPlayer.id && this.powerShotAvailable && this.powerShotConfig.enabled) {
      this.room.setDiscProperties(0, {
        xspeed: this.powerShotConfig.powerCoefficient * this.room.getDiscProperties(0).xspeed,
        yspeed: this.powerShotConfig.powerCoefficient * this.room.getDiscProperties(0).yspeed,
      });
      this.powerShotAvailable = false;
    }
  }

  public onPlayersBallTouch(playersTouchingBall: PlayerObject[]): void {
    if (!this.powerShotConfig.enabled || !this.hasKickedOff || !this.gameOn || playersTouchingBall.length === 0) {
      this.powershotInactive();
      return;
    }

    if (playersTouchingBall.length === 1) {
      const player = playersTouchingBall[0];
      if (this.playerTouchingBall?.id !== player.id) {
        this.powerShotAvailable = false;
        this.playerTouchingBall = player;
        this.timePlayerBallTouch = 0;
      } else {
        this.timePlayerBallTouch += 1;
        if (this.timePlayerBallTouch < this.powerShotConfig.timeout) {
          this.room.setDiscProperties(0, { color: 0x00ff00 });
        }
        if (this.timePlayerBallTouch === this.powerShotConfig.timeout) {
          this.room.setDiscProperties(0, { color: 0xff00ff });
          this.room.sendAnnouncement(`Powershot available 🚀⚽ !`, undefined, 0x00ff00, "italic", 2); //Power shot is activated when the player touches to the ball for 3 seconds long.
        }
        if (this.timePlayerBallTouch >= this.powerShotConfig.timeout) {
          this.powerShotAvailable = true;
        }
      }
    } else if (playersTouchingBall.length > 1) {
      const teamTouchingBall = playersTouchingBall[0].team;

      if (playersTouchingBall.every((player) => player.team === teamTouchingBall)) {
        if (!this.powerShotAvailable) {
          this.powerShotAvailable = true;
          this.room.setDiscProperties(0, { color: 0xff00ff });
          this.room.sendAnnouncement(`Twin shot available 🚀⚽ !`, undefined, 0x00ff00, "italic", 2);
        }
      } else {
        this.powershotInactive();
      }
    }
  }

  private powershotInactive(): void {
    this.powerShotAvailable = false;
    if (this.playerTouchingBall) {
      this.room.setDiscProperties(0, { color: this.ballColor });
      this.playerTouchingBall = undefined;
      this.timePlayerBallTouch = 0;
    }
  }

  getChatsCommands(): IChatCommand[] {
    return [
      {
        name: "Enable/Disable powershot",
        commands: ["!powershot", "!ps"],
        admin: true,
        method: (msg) => {
          this.powerShotConfig.enabled = !this.powerShotConfig.enabled;
          this.room.sendAnnouncement(`🚀 - ${this.powerShotConfig.enabled ? "Powershot enabled ✅" : "Powershot disabled ❌"} `);
          return false;
        },
      },
    ];
  }
}
