import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Zap, Trash2, Play, Download, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMashupGenerator } from "@/hooks/useMashupGenerator";


interface Song {
  id: string;
  name: string;
  artist: string;
  file: File;
}

interface MashupResult {
  title: string;
  audioUrl: string;
  concept: string;
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
  const [result, setResult] = useState<MashupResult | null>(null);
  const { generateMashup, isProcessing, progress, processingStep } = useMashupGenerator();

  // Trigger rave mode when processing
  useEffect(() => {
    onRaveModeChange?.(isProcessing);
  }, [isProcessing, onRaveModeChange]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const songData = e.dataTransfer.getData('application/json');
    if (songData) {
      const song = JSON.parse(songData);
      if (selectedSongs.length < 3 && !selectedSongs.find(s => s.id === song.id)) {
        // This would be handled by parent component
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const startMashup = async () => {
    if (selectedSongs.length < 2) return;

    setResult(null);
    const mashupResult = await generateMashup(selectedSongs);
    
    if (mashupResult) {
      setResult(mashupResult);
    }
  };

  return (
    <Card className={cn(
      "bg-gradient-twilight border-sunset-glow p-8 transition-all duration-500",
      selectedSongs.length > 0 && "shadow-glow animate-sunset-pulse",
      className
    )}>
      <div className="text-center space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h2 className="text-2xl font-bold bg-gradient-sunset bg-clip-text text-transparent">
            MASHUP ZONE
          </h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Drop your tracks and let AI create the perfect mashup
          </p>
        </div>

        {/* Drop Zone */}
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
              <div className="text-center">
                <p className="text-lg font-medium text-foreground mb-2">
                  Drag 2-3 tracks here
                </p>
                <p className="text-sm text-muted-foreground">
                  AI-powered music mashup generation
                </p>
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-4">
              {/* Selected Songs */}
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveSong(song.id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* Processing Status */}
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

              {/* Result */}
              {result && (
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
                    <Button size="sm" className="bg-gradient-sunset hover:shadow-glow">
                      <Play className="h-4 w-4 mr-2" />
                      Play
                    </Button>
                    <Button size="sm" variant="outline" className="border-twilight-pink text-twilight-pink hover:bg-twilight-pink/10">
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 justify-center">
          {selectedSongs.length >= 2 && !isProcessing && (
            <Button
              onClick={startMashup}
              size="xl"
              variant="sunset"
              disabled={isProcessing}
              className="font-bold animate-sunset-pulse"
            >
              <Zap className="h-5 w-5 mr-2" />
              {isProcessing ? "CREATING MASHUP..." : "CREATE MASHUP"}
            </Button>
          )}
          
          {selectedSongs.length > 0 && (
            <Button
              variant="outline"
              onClick={onClearAll}
              className="border-destructive text-destructive hover:bg-destructive/10"
            >
              Clear All
            </Button>
          )}
        </div>

        {/* Helper Text */}
        {selectedSongs.length === 1 && (
          <p className="text-sm text-muted-foreground">
            Drop one more track to start the magic ✨
          </p>
        )}
      </div>
    </Card>
  );
};