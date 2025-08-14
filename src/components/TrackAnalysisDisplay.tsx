import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { AnalysisResult } from '@/utils/audioAnalysis';
import { Zap, KeyRound, Activity, Sun } from 'lucide-react';

export function TrackAnalysisDisplay({ features }: { features: AnalysisResult }) {
  return (
    <Card className="p-4 space-y-3 bg-secondary/50">
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-semibold">Track Analysis</h4>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-muted-foreground" />
          <span>Tempo: {Math.round(features.beat_grid.bpm)} BPM</span>
        </div>
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          <span>Key: {features.key.name} ({features.key.camelot})</span>
        </div>
      </div>
      <div className="space-y-1 pt-2 border-t border-border">
        <label className="text-xs text-muted-foreground flex items-center gap-2">
          <Activity className="h-4 w-4" /> Energy
        </label>
        <Progress value={features.energy * 100} />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground flex items-center gap-2">
          <Sun className="h-4 w-4" /> Brightness
        </label>
        <Progress value={features.brightness * 100} />
      </div>
    </Card>
  );
}
