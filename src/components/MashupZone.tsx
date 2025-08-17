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
import { supabase } from "@/integrations/supabase/client";
import { TrackAnalysisDisplay } from "./TrackAnalysisDisplay";
import { MashupTimeline, type MashupSection } from "./MashupTimeline";
import { ClaudeCollaboration } from "./ClaudeCollaboration";
import { ClaudeMonitor } from "./ClaudeMonitor";

interface Song {
  id: string;
  name: string;
  artist: string;
  file?: File;
  storage_path?: string;
}

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
  onSongAdd?: (song: Song) => void;
  allSongs?: Song[]; // Add this to look up songs by ID
  className?: string;
}

export const MashupZone = ({ 
  selectedSongs, 
  onRemoveSong, 
  onClearAll,
  onSongAdd,
  allSongs = [],
  className 
}: MashupZoneProps) => {
  const {
    generateMashup,
    isProcessing: isGenerating,
    progress,
    processingStep,
    mashupResult,
    setMashupResult,
    claudePlan,
    claudeThoughts,
  } = useMashupGenerator();

  const { analyzeMashupCompatibility, analyzeSong, getAnalysis, isAnalyzing } = useAudioAnalysis();
  const [compatibility, setCompatibility] = useState<{ score: number; reasons: string[]; suggestions: string[] } | null>(null);
  const [isIterating, setIsIterating] = useState(false);
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

  const handleIteration = async (feedback: string) => {
    if (!mashupResult) return;
    setIsIterating(true);
    toast.info("Claude is working on a new version...");

    try {
      const { data, error } = await supabase.functions.invoke('claude-mashup-iteration', {
        body: {
          mashupPlan: {
            title: mashupResult.title,
            concept: mashupResult.concept,
            timeline: mashupResult.timeline,
          },
          userFeedback: feedback,
          songs: selectedSongs,
          analysisData: selectedSongs.map(s => getAnalysis(s.id)),
        },
      });

      if (error || !data.success) {
        throw new Error(error?.message || "Failed to get revised plan.");
      }

      // We only update the concept and timeline, not the audio URL yet
      setMashupResult(prev => prev ? ({ ...prev, title: data.title, concept: data.concept, timeline: data.timeline }) : null);
      toast.success("Mashup concept updated by Claude!");

    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsIterating(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const songId = e.dataTransfer.getData('text/plain');
    if (songId) {
      // Look up the song by ID from all available songs
      const song = allSongs.find(s => s.id === songId);
      if (song && !selectedSongs.find(s => s.id === song.id)) {
        if (onSongAdd) {
          onSongAdd(song);
          toast.success(`Added ${song.name} to mashup!`);
        }
      }
    }
  };

  return (
    <Card className={cn("bg-card border p-6 space-y-6", className)}>
      <div className="text-center">
        <h2 className="text-2xl font-bold text-primary">Mashup Zone</h2>
        <p className="text-muted-foreground text-sm">AI-powered music mashup generation</p>
      </div>

      <div 
        className="min-h-64 border-2 border-dashed rounded-xl p-4 flex flex-col justify-center items-center text-center space-y-4 transition-colors hover:border-primary/50"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {selectedSongs.length === 0 ? (
          <>
            <div className="w-16 h-16 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
            <p className="font-medium">Drag 2-3 tracks here</p>
          </>
        ) : (
          <div className="w-full space-y-3">
            {selectedSongs.map((song) => {
              const analysis = getAnalysis(song.id);
              return (
                <div key={song.id} className="space-y-2">
                  <div className="flex items-center justify-between p-2 bg-background rounded-md border">
                    <div className="flex-1 text-left">
                      <p className="font-medium text-sm">{song.name}</p>
                      <p className="text-xs text-muted-foreground">{song.artist}</p>
                    </div>
                    <div className="flex items-center">
                      <Button variant="ghost" size="sm" onClick={() => analyzeSong(song)} disabled={isAnalyzing || !song.file}>
                        <Brain className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => onRemoveSong(song.id)} className="hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {analysis && analysis.rhythmic && analysis.harmonic && (
                    <TrackAnalysisDisplay analysis={analysis} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-4">
        {(isGenerating || isIterating) && (
          <div className="space-y-2 text-center">
            <p className="text-sm font-medium text-primary">{isIterating ? 'Claude is iterating...' : processingStep}</p>
            {isGenerating && <Progress value={progress} className="w-full" />}
            {isGenerating && <ClaudeMonitor plan={claudePlan} thoughts={claudeThoughts} />}
          </div>
        )}

        {compatibility && !isGenerating && !isIterating && selectedSongs.length >= 2 && (
          <CompatibilityScore score={compatibility.score} reasons={compatibility.reasons} suggestions={compatibility.suggestions} />
        )}

        {mashupResult && !isGenerating && (
          <div className="space-y-4">
            <div className="space-y-3 p-4 bg-background rounded-lg border">
              <div className="text-center">
                <h3 className="text-lg font-bold text-primary">"{mashupResult.title}"</h3>
                <p className="text-sm text-muted-foreground italic">{mashupResult.concept}</p>
              </div>
              {mashupResult.timeline && <MashupTimeline timeline={mashupResult.timeline} />}
              <div className="flex gap-2 justify-center">
                {mashupResult.audioUrl ? (
                  <>
                    <Button size="sm" onClick={() => { if (audioRef.current) audioRef.current.pause(); audioRef.current = new Audio(mashupResult.audioUrl); audioRef.current.play().catch(e => toast.error('Error playing audio.')); }}>
                      <Play className="h-4 w-4 mr-2" /> Play
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { const link = document.createElement('a'); link.href = mashupResult.audioUrl; link.download = `${mashupResult.title}.mp3`; link.click(); }}>
                      <Download className="h-4 w-4 mr-2" /> Download
                    </Button>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground italic">
                    Audio processing coming soon! For now, enjoy the AI-generated concept and timeline.
                  </div>
                )}
              </div>
            </div>
            <ClaudeCollaboration
              mashupConcept={mashupResult.concept}
              analysisData={selectedSongs.map(s => getAnalysis(s.id))}
              onIterationRequest={handleIteration}
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {selectedSongs.length >= 2 && (
          <Button onClick={startMashup} size="lg" disabled={isGenerating || isIterating} className="font-bold w-full">
            <Zap className="h-5 w-5 mr-2" />
            {isGenerating ? "Creating..." : (isIterating ? "Update & Re-Generate" : "Create Mashup")}
          </Button>
        )}
        {selectedSongs.length > 0 && (
          <Button variant="outline" size="sm" onClick={onClearAll}>Clear All</Button>
        )}
      </div>
    </Card>
  );
};