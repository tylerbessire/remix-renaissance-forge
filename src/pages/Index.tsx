import React, { useState, useCallback, useEffect } from 'react';
import { YouTubeSearch, type YouTubeSearchResult } from '@/components/YouTubeSearch';
import { SongColumn } from '@/components/SongColumn';
import { MashupZone } from '@/components/MashupZone';
import { SongLibrary } from '@/components/SongLibrary';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Sparkles, User, LogIn, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import type { User as SupabaseUser } from '@supabase/supabase-js';

// Enhanced Song interface to match original
interface Song {
  id: string;
  name: string;
  artist: string;
  file?: File;
  storage_path?: string;
}

const MashupStudio: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [songColumns, setSongColumns] = useState<Song[][]>([[], [], []]);
  const [selectedSongs, setSelectedSongs] = useState<Song[]>([]);
  const [draggedSong, setDraggedSong] = useState<Song | null>(null);
  const [savedSongs, setSavedSongs] = useState<Song[]>([]);

  // Authentication setup
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error('Error signing out');
    } else {
      toast.success('Signed out successfully');
    }
  };

  const handleSignIn = () => {
    navigate('/auth');
  };

  const handleSongsChange = useCallback((columnIndex: number, songs: Song[]) => {
    setSongColumns(prev => {
      const newColumns = [...prev];
      newColumns[columnIndex] = songs;
      return newColumns;
    });
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, song: Song) => {
    setDraggedSong(song);
    e.dataTransfer.effectAllowed = 'copy';
    // Only pass the song ID to avoid serializing File objects
    e.dataTransfer.setData('text/plain', song.id);
  }, []);

  const handleSongDropToMashup = useCallback((song: Song) => {
    if (!selectedSongs.find(s => s.id === song.id)) {
      setSelectedSongs(prev => [...prev, song]);
    }
  }, [selectedSongs]);

  const handleYouTubeSelection = async (result: YouTubeSearchResult) => {
    if (!user) {
      toast.error('Please sign in to download songs from YouTube');
      return;
    }
    
    toast.info(`Starting download: ${result.title}`);
    
    try {
      const { data, error } = await supabase.functions.invoke('youtube-download', {
        body: { url: result.url, title: result.title },
      });

      if (error || !data?.success) {
        throw new Error(data?.error || 'Download failed');
      }

      const newSong: Song = {
        id: crypto.randomUUID(),
        name: result.title,
        artist: 'YouTube',
        storage_path: data.storage_path,
      };

      // Add to first available column
      const targetColumnIndex = songColumns.findIndex(col => col.length < 5) || 0;
      handleSongsChange(targetColumnIndex, [...songColumns[targetColumnIndex], newSong]);
      setSavedSongs(prev => [...prev, newSong]);
      
      toast.success(`Downloaded: ${result.title}`);
    } catch (error: any) {
      toast.error(`Download failed: ${error.message}`);
    }
  };

  const handleRemoveFromMashup = (songId: string) => {
    setSelectedSongs(prev => prev.filter(s => s.id !== songId));
  };

  const handleClearMashup = () => {
    setSelectedSongs([]);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-r from-primary to-primary/60 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent">
                  Kill_mR_DJ: Remix Renaissance Forge
                </h1>
                <p className="text-sm text-muted-foreground">AI-powered music mashup creation studio</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {loading ? (
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              ) : user ? (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <User className="w-4 h-4" />
                    <span>{user.email}</span>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleSignOut}>
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </Button>
                </div>
              ) : (
                <Button variant="default" size="sm" onClick={handleSignIn}>
                  <LogIn className="w-4 h-4 mr-2" />
                  Sign In
                </Button>
              )}
              <SongLibrary songs={savedSongs} onSongDragStart={handleDragStart} />
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-4 gap-6">
          {/* YouTube Search */}
          <div className="lg:col-span-1">
            <YouTubeSearch onSongSelected={handleYouTubeSelection} />
          </div>

          {/* Song Columns */}
          <div className="lg:col-span-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {songColumns.map((songs, index) => (
                <SongColumn
                  key={index}
                  title={`Collection ${index + 1}`}
                  songs={songs}
                  onSongsChange={(newSongs) => handleSongsChange(index, newSongs)}
                  onDragStart={handleDragStart}
                />
              ))}
            </div>
          </div>

          {/* Mashup Zone */}
          <div className="lg:col-span-1">
            <MashupZone
              selectedSongs={selectedSongs}
              onRemoveSong={handleRemoveFromMashup}
              onClearAll={handleClearMashup}
              onSongAdd={handleSongDropToMashup}
              allSongs={[...songColumns.flat(), ...savedSongs]}
              className="flex-1"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default MashupStudio;
