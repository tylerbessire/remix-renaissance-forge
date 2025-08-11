import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Interface for a single search result
export interface YouTubeSearchResult {
  id: string;
  title: string;
  url: string;
  duration: string;
  thumbnail: string;
}

// Props for the component, including a callback for when a song is selected
interface YouTubeSearchProps {
  onSongSelected: (song: YouTubeSearchResult) => void;
}

export const YouTubeSearch = ({ onSongSelected }: YouTubeSearchProps) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<YouTubeSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    console.log("Starting search for query:", query);
    if (!query.trim()) return;
    setIsLoading(true);
    setError(null);
    setResults([]);

    try {
      console.log("Invoking youtube-search function...");
      const { data, error: funcError } = await supabase.functions.invoke<{ success: boolean, results: YouTubeSearchResult[] }>('youtube-search', {
        body: { query },
      });

      console.log("Function response:", { data, funcError });

      if (funcError) throw funcError;
      if (!data?.success) throw new Error('Search failed on the backend.');

      console.log("Setting results:", data.results);
      setResults(data.results);
    } catch (e: any) {
      console.error("Error in handleSearch:", e);
      setError(e.message || 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Search for a Song on YouTube</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-4">
          <Input
            placeholder="e.g., 'Never Gonna Give You Up'"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Button onClick={handleSearch} disabled={isLoading}>
            {isLoading ? 'Searching...' : 'Search'}
          </Button>
        </div>
        {error && <p className="text-red-500">{error}</p>}
        <div className="space-y-2">
          {results.map((item) => (
            <div key={item.id} className="flex items-center gap-4 p-2 rounded-md hover:bg-muted cursor-pointer" onClick={() => onSongSelected(item)}>
              <img src={item.thumbnail} alt={item.title} className="w-16 h-16 object-cover rounded-md" />
              <div className="flex-grow">
                <p className="font-semibold">{item.title}</p>
                <p className="text-sm text-muted-foreground">{item.duration}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
