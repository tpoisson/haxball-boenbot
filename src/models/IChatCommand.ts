type IChatCommand = {
  name: string;
  commands: string[];
  admin: boolean;
  method: (msg: string) => boolean;
};

export default IChatCommand;
