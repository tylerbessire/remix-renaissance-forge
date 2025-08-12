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
    { id: "1", title: "Vocal Tracks", songs: [] },
    { id: "2", title: "Instrumental Beds", songs: [] },
    { id: "3", title: "Rhythm & Drums", songs: [] },
  ]);
  
  const [selectedSongs, setSelectedSongs] = useState<Song[]>([]);
  const [fileRegistry, setFileRegistry] = useState<Map<string, File>>(new Map());

  const updateColumnSongs = (columnId: string, songs: Song[]) => {
    setFileRegistry(prev => {
      const newRegistry = new Map(prev);
      songs.forEach(song => {
        if (song.file) newRegistry.set(song.id, song.file);
      });
      return newRegistry;
    });
    setColumns(prev => prev.map(col => col.id === columnId ? { ...col, songs } : col));
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

  const handleMashupDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const songData = e.dataTransfer.getData('application/json');
    if (songData) {
      const songMetadata = JSON.parse(songData);
      const file = fileRegistry.get(songMetadata.id);
      if (file) {
        addToMashup({ ...songMetadata, file });
      } else {
        toast.error("Could not find audio file for this track");
      }
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* New "Beams and Waves" Background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        {/* Waves */}
        <div className="absolute inset-0 bg-gradient-to-t from-cobalt-deep/50 via-transparent to-transparent animate-glow-rotate" />
        <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-accent/20 via-transparent to-transparent" />

        {/* Beams */}
        <div className="absolute top-0 left-1/4 w-1 h-full bg-cyan-bright/10 animate-led-flow-v" style={{ animationDuration: '10s' }} />
        <div className="absolute top-0 left-2/3 w-2 h-full bg-twilight-purple/10 animate-led-flow-v" style={{ animationDuration: '12s', animationDelay: '3s' }} />
        <div className="absolute top-1/2 left-0 w-full h-1 bg-sunset-glow/10 animate-led-flow-h" style={{ animationDuration: '8s' }} />
      </div>

      <header className="border-b border-border bg-background/80 backdrop-blur-lg sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold bg-gradient-sunset bg-clip-text text-transparent">
                Syncrasis
              </h1>
              <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-card">
                <Zap className="h-4 w-4 text-cyan-bright" />
                <span className="text-xs font-medium text-muted-foreground">AI Remix Studio</span>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 relative z-10">
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
          <div className="xl:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-6">
            {columns.map((column) => (
              <SongColumn
                key={column.id}
                title={column.title}
                songs={column.songs}
                onSongsChange={(songs) => updateColumnSongs(column.id, songs)}
                onDragStart={() => {}}
                className="h-fit"
              />
            ))}
          </div>

          <div className="xl:col-span-1">
            <div
              onDrop={handleMashupDrop}
              onDragOver={(e) => e.preventDefault()}
              className="sticky top-28"
            >
              <MashupZone
                selectedSongs={selectedSongs}
                onRemoveSong={removeFromMashup}
                onClearAll={clearMashup}
              />
            </div>
          </div>
        </div>

        <div className="mt-16 text-center max-w-3xl mx-auto">
          <div className="bg-card/80 backdrop-blur-sm rounded-xl p-8 border border-border">
            <h3 className="text-xl font-bold text-foreground mb-4">How It Works</h3>
            <p className="text-muted-foreground">
              1. Drop audio files into the columns. 2. Drag up to 3 tracks into the Mashup Zone. 3. Let the AI work its magic.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;