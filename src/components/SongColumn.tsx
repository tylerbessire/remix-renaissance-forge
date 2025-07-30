import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Music, Plus, X, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

interface Song {
  id: string;
  name: string;
  artist: string;
  file: File;
}

interface SongColumnProps {
  title: string;
  songs: Song[];
  onSongsChange: (songs: Song[]) => void;
  onDragStart: (song: Song, columnId: string) => void;
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
  };

  const removeSong = (songId: string) => {
    onSongsChange(songs.filter(song => song.id !== songId));
  };

  const handleDragStart = (e: React.DragEvent, song: Song) => {
    e.dataTransfer.setData('application/json', JSON.stringify(song));
    onDragStart(song, columnTitle);
  };

  return (
    <Card className={cn(
      "bg-cobalt-mid border-cobalt-light p-6 transition-all duration-300 hover:shadow-purple",
      className
    )}>
      <div className="space-y-4">
        {/* Column Header */}
        <div className="flex items-center justify-between">
          {isEditing ? (
            <Input
              value={columnTitle}
              onChange={(e) => setColumnTitle(e.target.value)}
              onBlur={() => setIsEditing(false)}
              onKeyDown={(e) => e.key === 'Enter' && setIsEditing(false)}
              className="bg-cobalt-deep border-sunset-glow text-foreground font-semibold"
              autoFocus
            />
          ) : (
            <h3 
              className="text-lg font-semibold text-foreground cursor-pointer hover:text-sunset-glow transition-colors"
              onClick={() => setIsEditing(true)}
            >
              {columnTitle}
            </h3>
          )}
          <Music className="h-5 w-5 text-twilight-pink" />
        </div>

        {/* Upload Zone */}
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
            className="flex items-center justify-center p-4 border-2 border-dashed border-cobalt-light rounded-lg bg-cobalt-deep/50 hover:border-sunset-glow hover:bg-cobalt-deep transition-all cursor-pointer group"
          >
            <div className="text-center">
              <Plus className="h-8 w-8 text-muted-foreground group-hover:text-sunset-glow mx-auto mb-2 transition-colors" />
              <p className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                Drop tracks or click to upload
              </p>
            </div>
          </label>
        </div>

        {/* Songs List */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {songs.map((song) => (
            <div
              key={song.id}
              draggable
              onDragStart={(e) => handleDragStart(e, song)}
              className="group flex items-center justify-between p-3 bg-cobalt-deep rounded-lg border border-cobalt-light hover:border-sunset-glow hover:shadow-glow transition-all cursor-grab active:cursor-grabbing hover:scale-102"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <GripVertical className="h-4 w-4 text-muted-foreground group-hover:text-sunset-glow transition-colors" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {song.name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {song.artist}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeSong(song.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        {songs.length > 0 && (
          <div className="text-xs text-muted-foreground text-center pt-2 border-t border-cobalt-light">
            {songs.length} track{songs.length !== 1 ? 's' : ''} loaded
          </div>
        )}
      </div>
    </Card>
  );
};