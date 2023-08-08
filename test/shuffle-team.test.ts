import { ShuffleTeamsPlugins } from "../src/plugins/shuffle-team";

/*
let room = HBInit({
  roomName: "test room",
  playerName: "bot",
  geo: {code: "DE", lat: 50, lon: 50}
});*/

const room = typeof RoomObject;
console.log(room);

describe("ShuffleTeamPlugin", function () {

  it("should sort empty player list", function () {});
    /*
  it("should sort empty player list", function () {

    // Given
    const room = {
      stopGame: () => {},
      startGame: () => {},
      sendAnnouncement: () => {},
      getPlayerList: () => []
    };
    const shuffleTeamPlugin = new ShuffleTeamsPlugins(room as any, {} as any);

    // When
    shuffleTeamPlugin.getChatsCommands()[0].method.call(this, "");

    // Expect
  });

  it("should sort 1 player team", function () {

    // Given
    const room = {
      players: [],
      stopGame: () => {},
      startGame: () => {},
      sendAnnouncement: () => {},
      getPlayerList: () => [{id: 1, name: "Fish", team: 1}],
      setPlayerTeam: (playerId: number, team: number): void => {}
    };
    const shuffleTeamPlugin = new ShuffleTeamsPlugins(room as any, {} as any);

    // When
    shuffleTeamPlugin.getChatsCommands()[0].method.call(this, "");

    // Expect
  });

  it("should sort 1 player teams", function () {

    // Given
    const room = {
      stopGame: () => {},
      startGame: () => {},
      sendAnnouncement: () => {},
      getPlayerList: () => [{id: 1, name: "Fish", team: 1}, {id: 2, name: "Bite", team: 2 }]
    };
    const shuffleTeamPlugin = new ShuffleTeamsPlugins(room as any, {} as any);

    // When
    shuffleTeamPlugin.getChatsCommands()[0].method.call(this, "");

    // Expect
  });
*/
});
