export type MapTypes = "futsal" | "classic" | "sniper" | "training";

export interface ICustomMap {
  type: MapTypes;
  players: number;
  content: string;
}
