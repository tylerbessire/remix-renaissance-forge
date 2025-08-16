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
    timeline: Array<{
      time_start_sec: number;
      duration_sec: number;
      description: string;
      energy_level: number;
      layers: Array<{
        songId: string;
        stem: string;
        volume_db: number;
        effects: string[];
      }>;
    }>;
    problems_and_solutions: Array<{
      problem: string;
      solution: string;
    }>;
  };
}
