export interface ICurrentGame {
  playerTouchingBall?: PlayerObject;
  lastBallKicker?: PlayerObject;
  previousBallKicker?: PlayerObject;
  hasKickedOff: boolean;
  isGameTime: boolean;
  powerShotActive: boolean;
  ballColor: number;
  timePlayerBallTouch: number; //The time indicator that increases as player touched to the ball
  scoring: { scorer: PlayerObject; time: number; ownGoal: boolean; assist?: PlayerObject }[];
  startTime: Date;
  endTime?: Date;
  possessions: { player: PlayerObject; ticks: number }[];
}
