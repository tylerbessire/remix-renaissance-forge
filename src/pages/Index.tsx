import { useState } from "react";
import { SongColumn } from "@/components/SongColumn";
import { MashupZone } from "@/components/MashupZone";
import { Button } from "@/components/ui/button";
import { Settings, Zap } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { YouTubeSearch } from "@/components/YouTubeSearch";
import { supabase } from "@/integrations/supabase/client";
import { type YouTubeSearchResult } from "@/components/YouTubeSearch";

// This interface is now updated to support both file uploads and YouTube downloads
interface Song {
  id: string;
  name: string;
  artist: string;
  file?: File;
  storage_path?: string;
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
  
  const [fileRegistry, setFileRegistry] = useState<Map<string, File>>(new Map());

  const updateColumnSongs = (columnId: string, songs: Song[]) => {
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
        const song: Song = { ...songMetadata, file };
        addToMashup(song);
      } else {
        const originalSong = columns.flatMap(c => c.songs).find(s => s.id === songMetadata.id);
        if (originalSong) {
          addToMashup(originalSong);
        } else {
          toast.error("Could not find this track.");
        }
      }
    }
  };

  const handleYouTubeSongSelected = async (ytSong: YouTubeSearchResult) => {
    toast.info(`Downloading "${ytSong.title}"...`);

    try {
      const { data, error } = await supabase.functions.invoke<{ success: boolean, storage_path: string }>('youtube-download', {
        body: { url: ytSong.url, title: ytSong.title },
      });

      if (error || !data?.success || !data.storage_path) {
        throw new Error(error?.message || 'Download failed on the backend.');
      }

      const newSong: Song = {
        id: ytSong.id,
        name: ytSong.title,
        artist: 'YouTube',
        storage_path: data.storage_path,
      };

      const firstColumn = columns[0];
      const updatedSongs = [...firstColumn.songs, newSong];
      updateColumnSongs(firstColumn.id, updatedSongs);

      toast.success(`"${ytSong.title}" added to '${firstColumn.title}'!`);

    } catch (e: any) {
      toast.error(`Failed to add song: ${e.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-background/80 backdrop-blur-sm sticky top-0 z-50 border-b">
        <div className="container mx-auto px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold text-primary">
                Syncrasis
              </h1>
              <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-secondary">
                <Zap className="h-4 w-4 text-accent" />
                <span className="text-xs font-medium">AI Music Remix Studio</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Link to="/auth">
                <Button size="sm" variant="secondary">Account</Button>
              </Link>
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary">
                <Settings className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <YouTubeSearch onSongSelected={handleYouTubeSongSelected} />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
          {/* Song Columns */}
          <div className="xl:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-6">
            {columns.map((column) => (
              <SongColumn
                key={column.id}
                title={column.title}
                songs={column.songs}
                onSongsChange={(songs) => updateColumnSongs(column.id, songs)}
                onDragStart={() => {}}
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
          <div className="bg-card rounded-xl p-8 border">
            <h3 className="text-2xl font-bold text-primary mb-4">
              How It Works
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="space-y-3">
                <div className="w-12 h-12 bg-primary/20 border-2 border-primary rounded-full flex items-center justify-center mx-auto text-xl font-bold text-primary">1</div>
                <div className="font-bold text-lg">Upload / Search</div>
                <p className="text-muted-foreground text-sm">Use the search bar to find songs on YouTube, or drop your own tracks into the columns.</p>
              </div>
              <div className="space-y-3">
                <div className="w-12 h-12 bg-primary/20 border-2 border-primary rounded-full flex items-center justify-center mx-auto text-xl font-bold text-primary">2</div>
                <div className="font-bold text-lg">Mix</div>
                <p className="text-muted-foreground text-sm">Drag 2-3 songs into the mashup zone to create something new.</p>
              </div>
              <div className="space-y-3">
                <div className="w-12 h-12 bg-primary/20 border-2 border-primary rounded-full flex items-center justify-center mx-auto text-xl font-bold text-primary">3</div>
                <div className="font-bold text-lg">Generate</div>
                <p className="text-muted-foreground text-sm">Let AI work its magic and create your unique remix.</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;