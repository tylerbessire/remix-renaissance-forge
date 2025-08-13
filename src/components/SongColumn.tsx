import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Music, Plus, X, GripVertical, Brain, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { AudioAnalysisDisplay } from "@/components/AudioAnalysisDisplay";
import { useAudioAnalysis } from "@/hooks/useAudioAnalysis";
import { toast } from "sonner";

interface Song {
  id: string;
  name: string;
  artist: string;
  file?: File;
  storage_path?: string;
}

interface SongColumnProps {
  title: string;
  songs: Song[];
  onSongsChange: (songs: Song[]) => void;
  onDragStart: (e: React.DragEvent, song: Song) => void;
  className?: string;
}

export const SongColumn = ({ 
  title, 
  songs, 
  onSongsChange, 
  onDragStart,
  className 
}: SongColumnProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [columnTitle, setColumnTitle] = useState(title);
  const { analyzeSong, getAnalysis, isAnalyzing } = useAudioAnalysis();

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const newSongs: Song[] = [];
    Array.from(files).forEach((file) => {
      if (file.type.startsWith('audio/')) {
        const song: Song = {
          id: crypto.randomUUID(),
          name: file.name.replace(/\.[^/.]+$/, ""),
          artist: "Unknown Artist",
          file
        };
        newSongs.push(song);
      }
    });

    onSongsChange([...songs, ...newSongs]);
    
    newSongs.forEach(song => {
      analyzeSong(song).catch(error => {
        console.error('Auto-analysis failed:', error);
      });
    });
  };

  const removeSong = (songId: string) => {
    onSongsChange(songs.filter(song => song.id !== songId));
  };

  const handleDragStart = (e: React.DragEvent, song: Song) => {
    onDragStart(e, song);
  };

  return (
    <Card className={cn("bg-card border p-4", className)}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          {isEditing ? (
            <Input
              value={columnTitle}
              onChange={(e) => setColumnTitle(e.target.value)}
              onBlur={() => setIsEditing(false)}
              onKeyDown={(e) => e.key === 'Enter' && setIsEditing(false)}
              className="font-semibold"
              autoFocus
            />
          ) : (
            <h3 
              className="text-lg font-semibold cursor-pointer"
              onClick={() => setIsEditing(true)}
            >
              {columnTitle}
            </h3>
          )}
          <Music className="h-5 w-5 text-muted-foreground" />
        </div>

        <div className="relative">
          <input
            type="file"
            multiple
            accept="audio/*"
            onChange={handleFileUpload}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            id={`upload-${columnTitle}`}
          />
          <label
            htmlFor={`upload-${columnTitle}`}
            className="flex items-center justify-center p-4 border-2 border-dashed rounded-lg hover:border-primary transition-all cursor-pointer group"
          >
            <div className="text-center">
              <Plus className="h-8 w-8 text-muted-foreground group-hover:text-primary mx-auto mb-2 transition-colors" />
              <p className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                Drop tracks or click to upload
              </p>
            </div>
          </label>
        </div>

        <div className="space-y-3 max-h-96 overflow-y-auto">
          {songs.map((song) => {
            const analysis = getAnalysis(song.id);
            return (
              <div key={song.id} className="space-y-2">
                <div
                  draggable
                  onDragStart={(e) => handleDragStart(e, song)}
                  className="group flex items-center justify-between p-3 bg-background rounded-lg border transition-all cursor-grab active:cursor-grabbing"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{song.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => analyzeSong(song)} disabled={isAnalyzing || !song.file}>
                      <Brain className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => removeSong(song.id)} className="hover:text-destructive">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {analysis && <AudioAnalysisDisplay features={analysis} />}
              </div>
            );
          })}
        </div>

        {songs.length > 0 && (
          <div className="text-xs text-muted-foreground text-center pt-2 border-t">
            {songs.length} track{songs.length !== 1 ? 's' : ''} loaded
          </div>
        )}
      </div>
    </Card>
  );
};