export type Media = {
  video: string;
  poster: string;
  author: string;
  source: string;
  license: string;
  licenseUrl: string;
  changes: string;
};

export type Move = {
  id: string; name: string; zh: string; style: string; level: string; focus: string;
  description: string; cues: string[]; bpm: number; media?: Media;
};

export type Account = { id: string; name: string };
export type Plan = { id: string; name: string; moveIds: string[] };
export type Mode = 'beats' | 'time';
export type Session = {
  id: string;
  name: string;
  moveIds: string[];
  mode: Mode;
  bpm: number;
  amount: number;
  index: number;
  remainingMs: number;
  ended: boolean;
};

export type Practice = Pick<Session, 'id' | 'name' | 'moveIds' | 'mode' | 'bpm' | 'amount'> & {
  elapsedSeconds: number;
  completedAt: string;
};

export type StudyState = { favorites: string[]; plans: Plan[]; history: Practice[] };

export function stepDuration(mode: Mode, amount: number, bpm: number) {
  return mode === 'beats' ? amount * 60_000 / bpm : amount * 1_000;
}
