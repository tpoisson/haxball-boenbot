export interface ICurrentGame {
  playerTouchingBall?: PlayerObject;
  lastBallKicker?: PlayerObject;
  previousBallKicker?: PlayerObject;
  isGameTime: boolean;
  scoring: { scorer: PlayerObject; time: number; ownGoal: boolean; assist?: PlayerObject }[];
  startTime: Date;
  endTime?: Date;
  // possessions: { player: PlayerObject; ticks: number }[];
}
