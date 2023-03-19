export interface RegisteredUser {
  id: string; // Internal ID
  name: string; // Internal name (deprecated)
  publicIds: string[]; // The player's public ID. Players can view their own ID's here: https://www.haxball.com/playerauth
  sessionId?: number; // The id of the player, each player that joins the room gets a unique id that will never change.
  greetings: string[];
}
