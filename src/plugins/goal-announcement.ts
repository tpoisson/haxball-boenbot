import IChatCommand from "../models/IChatCommand";
import { PlayerScoreObject } from "../room/HaxballRoom";
import RoomPlugin from "../room/room-plugin";
import { isMatch } from "../utils/common";

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

  public onTeamVictory(scoreHistory: PlayerScoreObject[]): void {
    if (isMatch(this.room)) {
      const announcements = [];

      // Homme du match
      const playerMatchData = new Map<number, { points: number; name: string; goals: number; assists: number; ownGoals: number }>();
      scoreHistory.forEach((scoring) => {
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
          `🎖️ Best player : ${manOfTheMatch.name} ! ${manOfTheMatch.goals} goals / ${manOfTheMatch.assists} assists / ${manOfTheMatch.ownGoals} own goals`,
        );
      }

      this.room.sendAnnouncement(announcements.join("\n"), undefined, 0xff00ff, "bold", 2);
    }
  }

  getChatsCommands(): IChatCommand[] {
    return [];
  }
}
