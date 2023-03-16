export interface ICurrentGame {
  playerTouchingBall?: PlayerObject;
  lastBallToucher?: PlayerObject;
  lastBallAssist?: PlayerObject;
  hasKickedOff: boolean;
  isGameTime: boolean;
  powerShotActive: boolean;
  ballColor: number;
  timePlayerBallTouch: number; //The time indicator that increases as player touched to the ball
  scoring: { playerId: string; time: Date; ownGoal: boolean; assist: boolean }[];
  startTime: Date;
  endTime?: Date;
}
