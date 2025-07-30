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
    <div className="min-h-screen bg-gradient-vibrant relative overflow-hidden">
      {/* Vibrant animated overlay */}
      <div className="fixed inset-0 bg-gradient-to-br from-sunset-glow/30 via-cyan-bright/20 to-twilight-pink/25 pointer-events-none animate-glow-rotate" />
      <div className="fixed inset-0 bg-gradient-to-t from-cobalt-deep/80 via-cobalt-mid/40 to-transparent pointer-events-none" />
      
      {/* Header */}
      <header className="border-b border-cyan-bright/30 bg-cobalt-deep/70 backdrop-blur-xl sticky top-0 z-50 shadow-card">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <h1 className="text-4xl font-black bg-gradient-sunset bg-clip-text text-transparent tracking-tight">
                Syncrasis
              </h1>
              <div className="hidden md:flex items-center gap-3 px-4 py-2 rounded-2xl bg-cyan-bright/20 border border-cyan-bright/30 backdrop-blur-sm">
                <Zap className="h-5 w-5 text-cyan-bright" />
                <span className="text-sm font-medium text-cyan-bright">AI Music Remix Studio</span>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-sunset-glow hover:bg-sunset-glow/10 rounded-xl transition-all duration-300">
                <Settings className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-12 relative z-10">
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
        <div className="mt-16 text-center max-w-4xl mx-auto">
          <div className="bg-gradient-card rounded-3xl p-8 border border-cyan-bright/20 shadow-card backdrop-blur-sm">
            <h3 className="text-2xl font-bold text-sunset-glow mb-6">
              How It Works
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="space-y-4">
                <div className="w-12 h-12 bg-gradient-to-br from-twilight-pink to-sunset-glow rounded-2xl flex items-center justify-center mx-auto text-2xl font-bold text-white">1</div>
                <div className="text-twilight-pink font-bold text-lg">Upload</div>
                <p className="text-muted-foreground leading-relaxed">Drop your tracks into the columns and organize them however you want.</p>
              </div>
              <div className="space-y-4">
                <div className="w-12 h-12 bg-gradient-to-br from-sunset-glow to-cyan-bright rounded-2xl flex items-center justify-center mx-auto text-2xl font-bold text-white">2</div>
                <div className="text-sunset-glow font-bold text-lg">Mix</div>
                <p className="text-muted-foreground leading-relaxed">Drag 2-3 songs into the mashup zone to create something new.</p>
              </div>
              <div className="space-y-4">
                <div className="w-12 h-12 bg-gradient-to-br from-cyan-bright to-twilight-purple rounded-2xl flex items-center justify-center mx-auto text-2xl font-bold text-white">3</div>
                <div className="text-accent font-bold text-lg">Generate</div>
                <p className="text-muted-foreground leading-relaxed">Let AI work its magic and create your unique remix.</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;