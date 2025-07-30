import { useState } from "react";
import { SongColumn } from "@/components/SongColumn";
import { MashupZone } from "@/components/MashupZone";
import { Button } from "@/components/ui/button";
import { Settings, Zap } from "lucide-react";
import { toast } from "sonner";

interface Song {
  id: string;
  name: string;
  artist: string;
  file: File;
}

interface Column {
  id: string;
  title: string;
  songs: Song[];
}

const Index = () => {
  const [columns, setColumns] = useState<Column[]>([
    { id: "1", title: "Vibe Check", songs: [] },
    { id: "2", title: "Bangers", songs: [] },
    { id: "3", title: "Chill Zone", songs: [] },
  ]);
  
  const [selectedSongs, setSelectedSongs] = useState<Song[]>([]);

  const updateColumnSongs = (columnId: string, songs: Song[]) => {
    setColumns(prev => prev.map(col => 
      col.id === columnId ? { ...col, songs } : col
    ));
  };

  const handleDragStart = (song: Song, columnId: string) => {
    // Drag start logic handled in SongColumn
  };

  const addToMashup = (song: Song) => {
    if (selectedSongs.length >= 3) {
      toast.error("Max 3 tracks in the mashup zone!");
      return;
    }
    
    if (selectedSongs.find(s => s.id === song.id)) {
      toast.error("Track already in mashup zone!");
      return;
    }

    setSelectedSongs(prev => [...prev, song]);
    toast.success(`Added "${song.name}" to mashup zone`);
  };

  const removeFromMashup = (songId: string) => {
    setSelectedSongs(prev => prev.filter(s => s.id !== songId));
  };

  const clearMashup = () => {
    setSelectedSongs([]);
    toast.success("Mashup zone cleared");
  };

  // Handle drop in mashup zone
  const handleMashupDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const songData = e.dataTransfer.getData('application/json');
    if (songData) {
      const song = JSON.parse(songData);
      addToMashup(song);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-cobalt-light bg-cobalt-deep/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-3xl font-bold bg-gradient-sunset bg-clip-text text-transparent">
                PLAY-THOSE
              </h1>
              <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
                <Zap className="h-4 w-4" />
                <span>AI Music Remix Studio</span>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-sunset-glow">
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
          {/* Song Columns */}
          <div className="xl:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-6">
            {columns.map((column) => (
              <SongColumn
                key={column.id}
                title={column.title}
                songs={column.songs}
                onSongsChange={(songs) => updateColumnSongs(column.id, songs)}
                onDragStart={handleDragStart}
                className="h-fit"
              />
            ))}
          </div>

          {/* Mashup Zone */}
          <div className="xl:col-span-1">
            <div
              onDrop={handleMashupDrop}
              onDragOver={(e) => e.preventDefault()}
              className="sticky top-24"
            >
              <MashupZone
                selectedSongs={selectedSongs}
                onRemoveSong={removeFromMashup}
                onClearAll={clearMashup}
              />
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-12 text-center max-w-2xl mx-auto">
          <div className="bg-cobalt-mid/50 rounded-xl p-6 border border-cobalt-light">
            <h3 className="text-lg font-semibold text-sunset-glow mb-3">
              How It Works
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground">
              <div className="space-y-2">
                <div className="text-twilight-pink font-medium">1. Upload</div>
                <p>Drop your tracks into the columns and organize them however you want.</p>
              </div>
              <div className="space-y-2">
                <div className="text-sunset-glow font-medium">2. Mix</div>
                <p>Drag 2-3 songs into the mashup zone to create something new.</p>
              </div>
              <div className="space-y-2">
                <div className="text-accent font-medium">3. Generate</div>
                <p>Let the AI raccoons work their magic and create your unique remix.</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;