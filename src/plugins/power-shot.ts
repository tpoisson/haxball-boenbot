import IChatCommand from "../models/IChatCommand";
import RoomPlugin from "../room/room-plugin";
import { pointDistance } from "../utils/common";

export class PowerShotPlugin extends RoomPlugin {
  private powerShotConfig = {
    enabled: false,
    timeout: 60 * 2, // This means 2 seconds.
    powerCoefficient: 2, // Original ball kick speed would be multiplied by this number when power shot is activated.
    distanceSensitivity: 1.1, // Percentage of distance
  };

  private ballRadius?: number;
  private ballColor?: number;

  private powerShotActive = false;
  private hasKickedOff = false;
  private playerTouchingBall?: PlayerObject;

  private timePlayerBallTouch: number = 0;

  public onGameStart(byPlayer: PlayerObject): void {
    this.ballRadius = this.room.getDiscProperties(0).radius;
    this.ballColor = this.room.getDiscProperties(0).color;
  }

  public onPlayerBallKick(byPlayer: PlayerObject): void {
    if (this.hasKickedOff === false) {
      this.hasKickedOff = true;
    }
    if (this.playerTouchingBall?.id === byPlayer.id && this.powerShotActive && this.powerShotConfig.enabled) {
      this.room.setDiscProperties(0, {
        xspeed: this.powerShotConfig.powerCoefficient * this.room.getDiscProperties(0).xspeed,
        yspeed: this.powerShotConfig.powerCoefficient * this.room.getDiscProperties(0).yspeed,
      });
      this.powerShotActive = false;
    }
  }

  public onPlayersBallTouch(playersTouchingBall: PlayerObject[]): void {
    if (!this.powerShotConfig.enabled || !this.hasKickedOff) {
      return;
    }

    if (playersTouchingBall.length === 0) {
      this.powerShotActive = false;
      if (this.playerTouchingBall) {
        this.room.setDiscProperties(0, { color: this.ballColor });
        this.playerTouchingBall = undefined;
        this.timePlayerBallTouch = 0;
      }
    } else if (playersTouchingBall.length === 1) {
      const player = playersTouchingBall[0];
      if (this.playerTouchingBall?.id !== player.id) {
        this.powerShotActive = false;
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
          this.powerShotActive = true;
        }
      }
      /*
      let possession = this.currentGame.possessions.find((possession) => possession.player.id === player.id);
      if (!possession) {
        possession = { player: { ...player }, ticks: 0 };
        this.currentGame.possessions.push(possession);
      }
      possession.ticks += 1;*/
    } else {
      const teamTouchingBall = playersTouchingBall[0].team;

      if (playersTouchingBall.every((player) => player.team === teamTouchingBall)) {
        if (!this.powerShotActive) {
          this.powerShotActive = true;
          this.room.setDiscProperties(0, { color: 0xff00ff });
          this.room.sendAnnouncement(`Twin shot available 🚀⚽ !`, undefined, 0x00ff00, "italic", 2);
        }
      } else {
        this.powerShotActive = false;
        if (this.playerTouchingBall) {
          this.room.setDiscProperties(0, { color: this.ballColor });
          this.playerTouchingBall = undefined;
        }
      }
    }
  }

  public onPositionsReset(): void {
    this.hasKickedOff = false;
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