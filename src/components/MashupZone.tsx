import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Zap, Trash2, Play, Download, Sparkles, Brain } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMashupGenerator } from "@/hooks/useMashupGenerator";
import { CompatibilityScore } from "@/components/CompatibilityScore";
import { useAudioAnalysis } from "@/hooks/useAudioAnalysis";
import { toast } from "sonner";
import { TrackAnalysisDisplay } from "./TrackAnalysisDisplay";
import { MashupTimeline, type MashupSection } from "./MashupTimeline";

// Updated Song interface
interface Song {
  id: string;
  name: string;
  artist: string;
  file?: File;
  storage_path?: string;
}

// Updated MashupResult to include timeline
interface MashupResult {
  title: string;
  audioUrl: string;
  concept: string;
  timeline?: MashupSection[];
}

interface MashupZoneProps {
  selectedSongs: Song[];
  onRemoveSong: (songId: string) => void;
  onClearAll: () => void;
  className?: string;
}

export const MashupZone = ({ 
  selectedSongs, 
  onRemoveSong, 
  onClearAll,
  className 
}: MashupZoneProps) => {
  const {
    generateMashup,
    isProcessing,
    progress,
    processingStep,
    mashupResult
  } = useMashupGenerator();

  const { analyzeMashupCompatibility, analyzeSong, getAnalysis, isAnalyzing } = useAudioAnalysis();
  const [compatibility, setCompatibility] = useState<{ score: number; reasons: string[]; suggestions: string[] } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) audioRef.current.pause();
    };
  }, []);

  useEffect(() => {
    if (selectedSongs.length >= 2) {
      analyzeMashupCompatibility(selectedSongs).then(setCompatibility);
    } else {
      setCompatibility(null);
    }
  }, [selectedSongs, analyzeMashupCompatibility]);

  const startMashup = async () => {
    if (selectedSongs.length < 2) return;
    await generateMashup(selectedSongs);
  };

  return (
    <Card className={cn("bg-glass p-6 space-y-6", className)}>
      <div className="text-center">
        <h2 className="text-2xl font-bold text-primary text-glow">Mashup Zone</h2>
        <p className="text-muted-foreground text-sm">AI-powered music mashup generation</p>
      </div>

      <div className="min-h-64 border-2 border-dashed border-muted rounded-xl p-4 flex flex-col justify-center items-center text-center space-y-4">
        {selectedSongs.length === 0 ? (
          <>
            <div className="w-16 h-16 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
            <p className="font-medium text-foreground">Drag 2-3 tracks here</p>
          </>
        ) : (
          <div className="w-full space-y-3">
            {selectedSongs.map((song) => {
              const analysis = getAnalysis(song.id);
              return (
                <div key={song.id} className="space-y-2">
                  <div className="flex items-center justify-between p-2 bg-secondary rounded-md">
                    <div className="flex-1 text-left">
                      <p className="font-medium text-sm text-foreground">{song.name}</p>
                      <p className="text-xs text-muted-foreground">{song.artist}</p>
                    </div>
                    <div className="flex items-center">
                      <Button variant="ghost" size="sm" onClick={() => analyzeSong(song)} disabled={isAnalyzing || !song.file}>
                        <Brain className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => onRemoveSong(song.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {analysis && <TrackAnalysisDisplay features={analysis.features} />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-4">
        {isProcessing && (
          <div className="space-y-2 text-center">
            <p className="text-sm font-medium text-primary">{processingStep}</p>
            <Progress value={progress} className="w-full" />
          </div>
        )}

        {compatibility && !isProcessing && selectedSongs.length >= 2 && (
          <CompatibilityScore score={compatibility.score} reasons={compatibility.reasons} suggestions={compatibility.suggestions} />
        )}

        {mashupResult && !isProcessing && (
          <div className="space-y-3 p-4 bg-secondary rounded-lg">
            <div className="text-center">
              <h3 className="text-lg font-bold text-primary">"{mashupResult.title}"</h3>
              <p className="text-sm text-muted-foreground italic">{mashupResult.concept}</p>
            </div>
            {mashupResult.timeline && <MashupTimeline timeline={mashupResult.timeline} />}
            <div className="flex gap-2 justify-center">
              <Button size="sm" onClick={() => { if (audioRef.current) audioRef.current.pause(); audioRef.current = new Audio(mashupResult.audioUrl); audioRef.current.play().catch(e => toast.error('Error playing audio.')); }}>
                <Play className="h-4 w-4 mr-2" /> Play
              </Button>
              <Button size="sm" variant="outline" onClick={() => { const link = document.createElement('a'); link.href = mashupResult.audioUrl; link.download = `${mashupResult.title}.mp3`; link.click(); }}>
                <Download className="h-4 w-4 mr-2" /> Download
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {selectedSongs.length >= 2 && (
          <Button onClick={startMashup} size="lg" disabled={isProcessing} className="font-bold w-full">
            <Zap className="h-5 w-5 mr-2" />
            {isProcessing ? "Creating..." : "Create Mashup"}
          </Button>
        )}
        {selectedSongs.length > 0 && (
          <Button variant="outline" size="sm" onClick={onClearAll}>Clear All</Button>
        )}
      </div>
    </Card>
  );
};