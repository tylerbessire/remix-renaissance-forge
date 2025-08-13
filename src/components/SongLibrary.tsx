import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Music } from "lucide-react";

interface Song {
  id: string;
  name: string;
  artist: string;
}

interface SongLibraryProps {
  songs: Song[];
  onSongDragStart: (e: React.DragEvent, song: Song) => void;
}

export const SongLibrary = ({ songs, onSongDragStart }: SongLibraryProps) => {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">
          <Music className="mr-2 h-4 w-4" />
          Song Library
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle>Song Library</SheetTitle>
        </SheetHeader>
        <div className="py-4">
          <div className="space-y-2">
            {songs.length > 0 ? (
              songs.map((song) => (
                <div
                  key={song.id}
                  draggable
                  onDragStart={(e) => onSongDragStart(e, song)}
                  className="flex items-center gap-4 p-2 rounded-md hover:bg-muted cursor-grab border"
                >
                  <div className="flex-grow">
                    <p className="font-semibold">{song.name}</p>
                    <p className="text-sm text-muted-foreground">{song.artist}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-center">Your song library is empty. Download songs from YouTube to add them here.</p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
