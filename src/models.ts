export interface InteractPlayer {
    name: string;
    greetings: string[];
}

export type MapTypes = 'futsal' | 'classic' | 'sniper' | 'training';

export interface ICustomMap {
    type: MapTypes;
    players: number;
    content: string;
}

export interface IPlayerActivity {
    date: Date;
}