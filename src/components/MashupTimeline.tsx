import { Card } from '@/components/ui/card';

// Define a color map for different stems
const STEM_COLORS: { [key: string]: string } = {
  vocals: 'bg-blue-500',
  drums: 'bg-red-500',
  bass: 'bg-yellow-500',
  other: 'bg-green-500',
  melody: 'bg-purple-500',
  piano: 'bg-pink-500',
};

export interface MashupSection {
  start: number;
  duration: number;
  description: string;
  layers: { stem: string; volume: number; effects?: string[] }[];
}

export function MashupTimeline({ timeline }: { timeline: MashupSection[] }) {
  const totalDuration = timeline.reduce((sum, s) => sum + s.duration, 0);

  if (totalDuration === 0) return null; // Don't render if timeline is empty

  return (
    <Card className="p-4 space-y-3 bg-secondary/50">
      <h4 className="text-sm font-semibold">Mashup Timeline</h4>
      <div className="w-full h-20 bg-muted rounded-lg flex overflow-hidden">
        {timeline.map((section, idx) => {
          const width = (section.duration / totalDuration) * 100;
          return (
            <div
              key={idx}
              className="h-full border-r border-background/50 flex flex-col justify-end"
              style={{ width: `${width}%` }}
              title={`${section.description} (${section.duration}s)`}
            >
              {section.layers.map((layer, layerIdx) => (
                <div
                  key={layerIdx}
                  className={`h-1/4 ${STEM_COLORS[layer.stem] || STEM_COLORS.other}`}
                  style={{ opacity: layer.volume }}
                  title={`Stem: ${layer.stem}, Volume: ${layer.volume}`}
                />
              ))}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
