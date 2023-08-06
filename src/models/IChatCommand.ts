type IChatCommand = {
  name: string;
  commands: string[];
  admin: boolean;
  method: (msg: string, playerId: PlayerObject) => boolean;
};

export default IChatCommand;
