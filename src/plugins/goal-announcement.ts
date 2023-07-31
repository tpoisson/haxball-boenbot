import IChatCommand from "../models/IChatCommand";
import { PlayerScoreObject } from "../room/HaxballRoom";
import RoomPlugin from "../room/room-plugin";

export class GoalAnnouncementPlugin extends RoomPlugin {
  public onTeamGoal(scoreHistory: PlayerScoreObject[]): void {
    const announcements = [];
    const score = scoreHistory[scoreHistory.length - 1];
    if (score.ownGoal) {
      announcements.push(`⚽🚨 Magnifique CSC, GG ${score.scorer.name} !`);
    } else {
      const allScorerGoals = scoreHistory.filter((scoring) => scoring.scorer.id === score.scorer.id && !scoring.ownGoal);
      if (allScorerGoals.length === 2) {
        announcements.push(`⚽ Doublé de ${score.scorer.name} !`);
      } else if (allScorerGoals.length === 3) {
        announcements.push(`⚽ Triplé de ${score.scorer.name} !`);
      } else {
        announcements.push(`⚽ But de ${score.scorer.name} !`);
      }
    }
    if (score.assist) {
      announcements.push(`🏃🏻 Sur une passe décisive de ${score.assist.name} !`);
    }
    this.room.sendAnnouncement(announcements.join("\n"), undefined, undefined, "bold", 2);
  }

  getChatsCommands(): IChatCommand[] {
    return [];
  }
}
