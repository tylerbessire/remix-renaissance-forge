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
  const [isRaveMode, setIsRaveMode] = useState(false);
  const [columns, setColumns] = useState<Column[]>([
    { id: "1", title: "Vibe Check", songs: [] },
    { id: "2", title: "Bangers", songs: [] },
    { id: "3", title: "Chill Zone", songs: [] },
  ]);
  
  const [selectedSongs, setSelectedSongs] = useState<Song[]>([]);
  
  // File registry to preserve File objects during drag & drop
  const [fileRegistry, setFileRegistry] = useState<Map<string, File>>(new Map());

  const updateColumnSongs = (columnId: string, songs: Song[]) => {
    // Update file registry with new songs
    setFileRegistry(prev => {
      const newRegistry = new Map(prev);
      songs.forEach(song => {
        if (song.file instanceof File) {
          newRegistry.set(song.id, song.file);
        }
      });
      return newRegistry;
    });
    
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

  // Helper function to clean up file registry when songs are removed
  const cleanupFileRegistry = () => {
    setFileRegistry(prev => {
      const newRegistry = new Map(prev);
      const allSongIds = new Set([
        ...columns.flatMap(col => col.songs.map(s => s.id)),
        ...selectedSongs.map(s => s.id)
      ]);
      
      // Remove files that are no longer referenced
      for (const [songId] of newRegistry) {
        if (!allSongIds.has(songId)) {
          newRegistry.delete(songId);
        }
      }
      
      return newRegistry;
    });
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
      const songMetadata = JSON.parse(songData);
      
      // Restore File object from registry
      const file = fileRegistry.get(songMetadata.id);
      if (file) {
        const song: Song = {
          ...songMetadata,
          file
        };
        addToMashup(song);
      } else {
        toast.error("Could not find audio file for this track");
      }
    }
  };

  return (
    <div className={`min-h-screen bg-gradient-vibrant relative overflow-hidden transition-all duration-1000 ${isRaveMode ? 'animate-rave-flash' : ''}`}>
      {/* LED Circuit Background */}
      <div className={`fixed inset-0 pointer-events-none z-0 transition-all duration-1000 ${isRaveMode ? 'animate-laser-strobe' : ''}`}>
        {isRaveMode ? (
          /* Central Laser Show - Beams shooting from center */
          <>
            {/* Central point */}
            <div className="absolute top-1/2 left-1/2 w-4 h-4 bg-electric-blue rounded-full shadow-[0_0_30px_hsl(var(--electric-blue))] animate-pulse transform -translate-x-1/2 -translate-y-1/2" />
            
            {/* Radiating laser beams */}
            <div className="absolute top-1/2 left-1/2 w-96 h-1 opacity-90 animate-laser-beam-1 shadow-[0_0_20px_hsl(var(--electric-green))]" style={{ background: 'var(--laser-rainbow)', transformOrigin: 'left center', transform: 'translateY(-50%) rotate(0deg)' }} />
            <div className="absolute top-1/2 left-1/2 w-80 h-1 opacity-85 animate-laser-beam-2 shadow-[0_0_18px_hsl(var(--electric-blue))]" style={{ background: 'var(--laser-neon)', transformOrigin: 'left center', transform: 'translateY(-50%) rotate(45deg)' }} />
            <div className="absolute top-1/2 left-1/2 w-72 h-1 opacity-80 animate-laser-beam-3 shadow-[0_0_16px_hsl(var(--electric-purple))]" style={{ background: 'var(--laser-rainbow)', transformOrigin: 'left center', transform: 'translateY(-50%) rotate(90deg)' }} />
            <div className="absolute top-1/2 left-1/2 w-88 h-1 opacity-75 animate-laser-beam-4 shadow-[0_0_22px_hsl(var(--electric-red))]" style={{ background: 'var(--laser-neon)', transformOrigin: 'left center', transform: 'translateY(-50%) rotate(135deg)' }} />
            <div className="absolute top-1/2 left-1/2 w-84 h-1 opacity-85 animate-laser-beam-5 shadow-[0_0_19px_hsl(var(--electric-yellow))]" style={{ background: 'var(--laser-rainbow)', transformOrigin: 'left center', transform: 'translateY(-50%) rotate(180deg)' }} />
            <div className="absolute top-1/2 left-1/2 w-76 h-1 opacity-80 animate-laser-beam-6 shadow-[0_0_17px_hsl(var(--electric-green))]" style={{ background: 'var(--laser-neon)', transformOrigin: 'left center', transform: 'translateY(-50%) rotate(225deg)' }} />
            <div className="absolute top-1/2 left-1/2 w-92 h-1 opacity-90 animate-laser-beam-7 shadow-[0_0_24px_hsl(var(--electric-blue))]" style={{ background: 'var(--laser-rainbow)', transformOrigin: 'left center', transform: 'translateY(-50%) rotate(270deg)' }} />
            <div className="absolute top-1/2 left-1/2 w-68 h-1 opacity-75 animate-laser-beam-8 shadow-[0_0_15px_hsl(var(--electric-purple))]" style={{ background: 'var(--laser-neon)', transformOrigin: 'left center', transform: 'translateY(-50%) rotate(315deg)' }} />
          </>
        ) : (
          /* Normal ambient LED trails */
          <>
            {/* Horizontal LED trails - Multi-color lasers */}
            <div className="absolute top-[10%] left-0 w-4 h-0.5 opacity-80 animate-led-flow-h1 shadow-[0_0_10px_hsl(var(--electric-green))]" style={{ background: 'var(--laser-rainbow)' }} />
            <div className="absolute top-[25%] left-0 w-6 h-0.5 bg-electric-blue opacity-70 animate-led-flow-h2 shadow-[0_0_15px_hsl(var(--electric-blue))] animate-color-shift" />
            <div className="absolute top-[60%] left-0 w-5 h-0.5 opacity-75 animate-led-flow-h1 shadow-[0_0_12px_hsl(var(--electric-purple))]" style={{ background: 'var(--laser-neon)', animationDelay: '1s' }} />
            <div className="absolute top-[80%] left-0 w-8 h-0.5 bg-electric-red opacity-60 animate-led-flow-h2 shadow-[0_0_20px_hsl(var(--electric-red))] animate-color-shift" style={{ animationDelay: '3s' }} />
            
            {/* Additional rainbow laser streaks */}
            <div className="absolute top-[35%] left-0 w-10 h-0.5 opacity-85 animate-led-flow-h1 shadow-[0_0_25px_hsl(var(--electric-green))]" style={{ background: 'var(--laser-rainbow)', animationDelay: '0.5s' }} />
            <div className="absolute top-[45%] left-0 w-7 h-0.5 opacity-70 animate-led-flow-h2 shadow-[0_0_18px_hsl(var(--electric-blue))]" style={{ background: 'var(--laser-neon)', animationDelay: '2s' }} />
            
            {/* Vertical LED trails - Multi-color lasers */}
            <div className="absolute top-0 left-[15%] w-0.5 h-4 bg-electric-yellow opacity-85 animate-led-flow-v1 shadow-[0_0_8px_hsl(var(--electric-yellow))] animate-color-shift" />
            <div className="absolute top-0 left-[45%] w-0.5 h-6 opacity-65 animate-led-flow-v2 shadow-[0_0_16px_hsl(var(--electric-green))]" style={{ background: 'var(--laser-rainbow)', animationDelay: '1.5s' }} />
            <div className="absolute top-0 left-[75%] w-0.5 h-5 bg-electric-blue opacity-70 animate-led-flow-v1 shadow-[0_0_14px_hsl(var(--electric-blue))] animate-color-shift" style={{ animationDelay: '2.5s' }} />
            <div className="absolute top-0 right-[10%] w-0.5 h-7 opacity-80 animate-led-flow-v2 shadow-[0_0_18px_hsl(var(--electric-purple))]" style={{ background: 'var(--laser-neon)', animationDelay: '0.8s' }} />
            
            {/* Additional vertical rainbow streaks */}
            <div className="absolute top-0 left-[30%] w-0.5 h-8 opacity-75 animate-led-flow-v1 shadow-[0_0_20px_hsl(var(--electric-red))]" style={{ background: 'var(--laser-rainbow)', animationDelay: '3.2s' }} />
            <div className="absolute top-0 left-[60%] w-0.5 h-5 opacity-80 animate-led-flow-v2 shadow-[0_0_15px_hsl(var(--electric-purple))]" style={{ background: 'var(--laser-neon)', animationDelay: '1.8s' }} />
            
            {/* Diagonal LED trails */}
            <div className="absolute top-0 left-0 w-3 h-0.5 bg-electric-red opacity-60 animate-led-flow-d1 shadow-[0_0_10px_hsl(var(--electric-red))] transform rotate-45" />
            <div className="absolute top-0 left-0 w-4 h-0.5 bg-electric-yellow opacity-75 animate-led-flow-d2 shadow-[0_0_12px_hsl(var(--electric-yellow))] transform rotate-[135deg]" />
            
            {/* Color-shifting corner accents */}
            <div className="absolute top-4 left-4 w-16 h-16 border-2 border-electric-green rounded-lg animate-color-shift shadow-[0_0_20px_hsl(var(--electric-green))]" />
            <div className="absolute top-4 right-4 w-12 h-12 border-2 border-electric-blue rounded-full animate-color-shift shadow-[0_0_15px_hsl(var(--electric-blue))]" style={{ animationDelay: '2s' }} />
            <div className="absolute bottom-4 left-4 w-20 h-8 border-2 border-electric-purple rounded-full animate-color-shift shadow-[0_0_25px_hsl(var(--electric-purple))]" style={{ animationDelay: '4s' }} />
            <div className="absolute bottom-4 right-4 w-14 h-14 border-2 border-electric-red rounded-lg animate-color-shift shadow-[0_0_18px_hsl(var(--electric-red))]" style={{ animationDelay: '6s' }} />
          </>
        )}
      </div>
      
      {/* Vibrant animated overlay */}
      <div className="fixed inset-0 bg-gradient-to-br from-sunset-glow/30 via-cyan-bright/20 to-twilight-pink/25 pointer-events-none animate-glow-rotate z-1" />
      <div className="fixed inset-0 bg-gradient-to-t from-cobalt-deep/80 via-cobalt-mid/40 to-transparent pointer-events-none z-1" />
      
      {/* Header */}
      <header className="border-b border-cyan-bright/30 bg-cobalt-deep/70 backdrop-blur-xl sticky top-0 z-50 shadow-card relative">
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
                onRaveModeChange={setIsRaveMode}
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