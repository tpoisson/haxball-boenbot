import IChatCommand from "../models/IChatCommand";
import RoomPlugin from "../room/room-plugin";

export class OffsidePlugin extends RoomPlugin {
  private playersPositionWhenKicked?: PlayerObject[];

  private kicker?: PlayerObject;

  private shouldCheckOffside = false;

  private enabled: boolean = false;

  onTeamGoal(team: TeamID): void {
    this.resetInformation();
  }
  onTeamVictory(scores: ScoresObject): void {
    this.resetInformation();
  }
  onGameStop(byPlayer: PlayerObject): void {
    this.resetInformation();
  }
  onGamePause(byPlayer: PlayerObject): void {
    this.resetInformation();
  }

  onPlayerBallKick(byPlayer: PlayerObject): void {
    // When a player kicks the ball, the players positions on field are saved so when another player touches the ball, the offside check can be made
    if (this.enabled) {
      this.kicker = structuredClone(byPlayer);
      this.playersPositionWhenKicked = structuredClone(this.room.getPlayerList().filter((player) => player.team > 0));
      this.shouldCheckOffside = true;
    }
  }

  onPlayersBallTouch(byPlayers: PlayerObject[]): void {
    if (this.shouldCheckOffside && this.kicker && byPlayers.length && this.playersPositionWhenKicked?.length) {
      this.shouldCheckOffside = false;
      const teammate = byPlayers.find((byPlayer) => byPlayer.team === this.kicker!.team && byPlayer.id !== this.kicker!.id);

      // If this is a pass
      if (teammate) {
        const teamMatePositionWhenPassing = this.playersPositionWhenKicked.find((player) => player.id === teammate.id);
        const opponentsPositionsWhenPassing = this.playersPositionWhenKicked.filter((player) => player.team !== this.kicker!.team);
        if (teamMatePositionWhenPassing && opponentsPositionsWhenPassing.length) {
          if (
            this.kicker.team === 1 &&
            teamMatePositionWhenPassing.position.x > 0 && // Teammate in the opponent area
            opponentsPositionsWhenPassing.every((opponent) => opponent.position.x < teamMatePositionWhenPassing.position.x)
          ) {
            this.offsideDetected(teamMatePositionWhenPassing);
          }
          if (
            this.kicker.team === 2 &&
            teamMatePositionWhenPassing.position.x < 0 && // Teammate in the opponent area
            opponentsPositionsWhenPassing.every((opponent) => opponent.position.x > teamMatePositionWhenPassing.position.x)
          ) {
            this.offsideDetected(teamMatePositionWhenPassing);
          }
        }
      }
    }
  }

  private resetInformation() {
    this.kicker = undefined;
    this.playersPositionWhenKicked = undefined;
    this.shouldCheckOffside = false;
  }

  private offsideDetected(offsidePlayer: PlayerObject) {
    this.room.sendAnnouncement(`${offsidePlayer.name} is OFFSIDE !`, undefined, 0xff0000, "bold");
    // Every falty teammates behind midlane
    this.room
      .getPlayerList()
      .filter((player) => player.team === this.kicker!.team && (offsidePlayer.team === 1 ? player.position.x > 0 : player.position.x < 0))
      .forEach((player) => this.room.setPlayerDiscProperties(player.id, { x: 0 }));

    // Ball replaced on offside
    this.room.setDiscProperties(0, { x: offsidePlayer.position.x, y: offsidePlayer.position.y, xspeed: 0, yspeed: 0 });

    // One player placed next to it
    const faultKicker = this.room
      .getPlayerList()
      .filter((player) => player.team !== this.kicker!.team)
      .sort((p1, p2) => p1.position.x - p2.position.x)
      .at(0);
    this.room.setPlayerDiscProperties(faultKicker!.id, {
      x: offsidePlayer.position.x + this.room.getPlayerDiscProperties(offsidePlayer.id).radius * (offsidePlayer.team === 1 ? 1 : -1),
      y: offsidePlayer.position.y,
      xspeed: 0,
      yspeed: 0,
    });
  }

  public getChatsCommands(): IChatCommand[] {
    return [
      {
        name: "Toggle offside rule",
        commands: ["!offside", "!ofs"],
        admin: true,
        method: (msg) => {
          this.enabled = !this.enabled;
          this.room.sendAnnouncement(`🏁 - ${this.enabled ? "Offside enabled ✅" : "Offside disabled ❌"} `);
          if (!this.enabled) {
            this.resetInformation();
          }
          return false;
        },
      },
    ];
  }
}
