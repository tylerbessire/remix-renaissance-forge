export interface Layer {
  songId: string;
  stem: string;
  volume_db: number;
  effects: string[];
}

export interface TimelineEntry {
  time_start_sec: number;
  duration_sec: number;
  description: string;
  energy_level: number;
  layers: Layer[];
}

export interface ProblemSolution {
  problem: string;
  solution: string;
}

export interface Masterplan {
  creative_vision: string;
  masterplan: {
    title: string;
    artistCredits: string;
    global: {
      targetBPM: number;
      targetKey: string;
      timeSignature: [number, number];
    };
    timeline: TimelineEntry[];
    problems_and_solutions: ProblemSolution[];
  };
}
