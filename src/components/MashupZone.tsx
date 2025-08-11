import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Zap, Trash2, Play, Download, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMashupGenerator } from "@/hooks/useMashupGenerator";
import { ClaudeCollaboration } from "@/components/ClaudeCollaboration";
import { toast } from "sonner";

interface Song {
  id: string;
  name: string;
  artist: string;
  file: File;
}

interface MashupZoneProps {
  selectedSongs: Song[];
  onRemoveSong: (songId: string) => void;
  onClearAll: () => void;
  onRaveModeChange?: (isRave: boolean) => void;
  className?: string;
}

export const MashupZone = ({ 
  selectedSongs, 
  onRemoveSong, 
  onClearAll,
  onRaveModeChange,
  className 
}: MashupZoneProps) => {
// File: src/hooks/useMashupGenerator.ts

export const useMashupGenerator = () => {
  // Hold the last mashup result for consumers
  const [result, setResult] = useState<MashupResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processingStep, setProcessingStep] = useState("");

  const generateMashup = async (songs: Song[]): Promise<MashupResult | null> => {
    …
    // after successfully creating signedUrlData
    const mashupResult = {
      title: data.title,
      concept: data.concept,
      audioUrl: signedUrlData.signedUrl,
    };
    setResult(mashupResult);
    return mashupResult;
    …
  };

  // Expose the latest result alongside status flags
  return {
    generateMashup,
    isProcessing,
    progress,
    processingStep,
    result,
  };
};
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Cleanup audio when component unmounts or result changes
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [result]);

  // Trigger rave mode when processing
  useEffect(() => {
    onRaveModeChange?.(isProcessing);
  }, [isProcessing, onRaveModeChange]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    // Drop logic is handled by the parent component
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const startMashup = async () => {
    if (selectedSongs.length < 2) return;
    // The hook now manages its own state, so we just trigger it.
    await generateMashup(selectedSongs);
  };

  return (
    <Card className={cn(
      "bg-gradient-twilight border-sunset-glow p-8 transition-all duration-500",
      selectedSongs.length > 0 && "shadow-glow animate-sunset-pulse",
      className
    )}>
      <div className="text-center space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold bg-gradient-sunset bg-clip-text text-transparent">
            MASHUP ZONE
          </h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Drop your tracks and let AI create the perfect mashup
          </p>
        </div>

        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className={cn(
            "relative min-h-64 border-2 border-dashed rounded-xl transition-all duration-300",
            selectedSongs.length === 0 
              ? "border-cobalt-light bg-cobalt-deep/30" 
              : "border-sunset-glow bg-gradient-glow/10"
          )}
        >
          {selectedSongs.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4">
              <div className="w-24 h-24 rounded-full bg-gradient-sunset flex items-center justify-center animate-float shadow-purple">
                <Sparkles className="w-12 h-12 text-white" />
              </div>
              <p className="text-lg font-medium text-foreground">Drag 2-3 tracks here</p>
            </div>
          ) : (
            <div className="p-6 space-y-4">
              <div className="grid gap-3">
                {selectedSongs.map((song, index) => (
                  <div
                    key={song.id}
                    className="flex items-center justify-between p-3 bg-cobalt-deep/80 rounded-lg border border-sunset-glow/30 animate-slide-up"
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <div className="flex-1 text-left">
                      <p className="font-medium text-foreground">{song.name}</p>
                      <p className="text-sm text-muted-foreground">{song.artist}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => onRemoveSong(song.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              {isProcessing && (
                <div className="space-y-3 py-4">
                  <div className="flex items-center justify-center gap-2">
                    <Sparkles className="h-5 w-5 text-sunset-glow animate-pulse" />
                    <p className="text-sm font-medium text-sunset-glow">
                      {processingStep}
                    </p>
                  </div>
                  <Progress value={progress} className="w-full max-w-xs mx-auto" />
                </div>
              )}

              {result && !isProcessing && (
                <div className="space-y-4 p-4 bg-cobalt-deep/60 rounded-lg border border-twilight-pink/30 animate-slide-up">
                  <div className="text-center space-y-2">
                    <h3 className="text-xl font-bold text-sunset-glow">
                      "{result.title}"
                    </h3>
                    <p className="text-sm text-muted-foreground italic">
                      {result.concept}
                    </p>
                  </div>
                  <div className="flex gap-2 justify-center">
                    <Button size="sm" className="bg-gradient-sunset hover:shadow-glow" onClick={() => {
                      if (audioRef.current) audioRef.current.pause();
                      audioRef.current = new Audio(result.audioUrl);
                      audioRef.current.play().catch(e => toast.error('Unable to play audio'));
                    }}>
                      <Play className="h-4 w-4 mr-2" />
                      Play
                    </Button>
                    <Button size="sm" variant="outline" className="border-twilight-pink text-twilight-pink hover:bg-twilight-pink/10" onClick={() => {
                      const link = document.createElement('a');
                      link.href = result.audioUrl;
                      const safeTitle = (result.title || 'mashup')
                        .replace(/[\\\/:*?"<>|]+/g, '')
                        .trim()
                        .replace(/\s+/g, '_')
                        .slice(0, 100) || 'mashup';
                      link.download = `${safeTitle}.mp3`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}>
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {result && (
          <ClaudeCollaboration
            mashupConcept={result.concept}
            analysisData={[]}
            onIterationRequest={async (feedback) => {
              toast.info("Collaborating with Claude on new concept...");
              await generateMashup(selectedSongs);
            }}
          />
        )}

        <div className="flex gap-4 justify-center">
          {selectedSongs.length >= 2 && !isProcessing && (
            <Button onClick={startMashup} size="xl" variant="sunset" disabled={isProcessing} className="font-bold animate-sunset-pulse">
              <Zap className="h-5 w-5 mr-2" />
              CREATE MASHUP
            </Button>
          )}
          
          {selectedSongs.length > 0 && !isProcessing && (
            <Button variant="outline" onClick={onClearAll} className="border-destructive text-destructive hover:bg-destructive/10">
              Clear All
            </Button>
          )}
        </div>

        {selectedSongs.length === 1 && (
          <p className="text-sm text-muted-foreground">
            Drop one more track to start the magic ✨
          </p>
        )}
      </div>
    </Card>
  );
};