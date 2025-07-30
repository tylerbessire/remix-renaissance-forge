import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AudioFeatures } from "@/utils/audioAnalysis";
import { Music, Zap, Heart, Volume2, Mic, Guitar } from "lucide-react";

interface AudioAnalysisDisplayProps {
  features: AudioFeatures;
  className?: string;
}

export const AudioAnalysisDisplay = ({ features, className }: AudioAnalysisDisplayProps) => {
  const getFeatureColor = (value: number) => {
    if (value >= 0.7) return "text-electric-green";
    if (value >= 0.4) return "text-electric-yellow";
    return "text-electric-red";
  };

  const getEnergyEmoji = (energy: number) => {
    if (energy >= 0.8) return "🔥";
    if (energy >= 0.6) return "⚡";
    if (energy >= 0.4) return "✨";
    return "💫";
  };

  return (
    <Card className={`p-4 space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Music className="h-4 w-4 text-sunset-glow" />
          <span className="text-sm font-medium text-foreground">Audio Analysis</span>
        </div>
        {features.genre && (
          <Badge variant="outline" className="border-twilight-pink text-twilight-pink">
            {features.genre}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        {/* Tempo */}
        {features.tempo && (
          <div className="flex items-center gap-2">
            <Zap className="h-3 w-3 text-electric-blue" />
            <span className="text-muted-foreground">Tempo:</span>
            <span className="text-electric-blue font-medium">{features.tempo} BPM</span>
          </div>
        )}

        {/* Energy */}
        {features.energy !== undefined && (
          <div className="flex items-center gap-2">
            <Volume2 className="h-3 w-3 text-electric-red" />
            <span className="text-muted-foreground">Energy:</span>
            <span className={`font-medium ${getFeatureColor(features.energy)}`}>
              {getEnergyEmoji(features.energy)} {Math.round(features.energy * 100)}%
            </span>
          </div>
        )}

        {/* Danceability */}
        {features.danceability !== undefined && (
          <div className="flex items-center gap-2">
            <span className="text-electric-purple">💃</span>
            <span className="text-muted-foreground">Dance:</span>
            <span className={`font-medium ${getFeatureColor(features.danceability)}`}>
              {Math.round(features.danceability * 100)}%
            </span>
          </div>
        )}

        {/* Valence (Musical Positivity) */}
        {features.valence !== undefined && (
          <div className="flex items-center gap-2">
            <Heart className="h-3 w-3 text-electric-yellow" />
            <span className="text-muted-foreground">Mood:</span>
            <span className={`font-medium ${getFeatureColor(features.valence)}`}>
              {features.valence >= 0.7 ? "😊" : features.valence >= 0.4 ? "😐" : "😔"} {Math.round(features.valence * 100)}%
            </span>
          </div>
        )}

        {/* Speechiness */}
        {features.speechiness !== undefined && features.speechiness > 0.1 && (
          <div className="flex items-center gap-2">
            <Mic className="h-3 w-3 text-electric-green" />
            <span className="text-muted-foreground">Speech:</span>
            <span className="text-electric-green font-medium">
              {Math.round(features.speechiness * 100)}%
            </span>
          </div>
        )}

        {/* Acousticness */}
        {features.acousticness !== undefined && features.acousticness > 0.3 && (
          <div className="flex items-center gap-2">
            <Guitar className="h-3 w-3 text-electric-yellow" />
            <span className="text-muted-foreground">Acoustic:</span>
            <span className="text-electric-yellow font-medium">
              {Math.round(features.acousticness * 100)}%
            </span>
          </div>
        )}
      </div>

      {/* Audio Features Progress Bars */}
      {(features.energy !== undefined || features.danceability !== undefined || features.valence !== undefined) && (
        <div className="space-y-2 pt-2 border-t border-border">
          {features.energy !== undefined && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Energy</span>
                <span className="text-electric-red">{Math.round(features.energy * 100)}%</span>
              </div>
              <Progress value={features.energy * 100} className="h-1.5" />
            </div>
          )}
          
          {features.danceability !== undefined && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Danceability</span>
                <span className="text-electric-purple">{Math.round(features.danceability * 100)}%</span>
              </div>
              <Progress value={features.danceability * 100} className="h-1.5" />
            </div>
          )}
          
          {features.valence !== undefined && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Positivity</span>
                <span className="text-electric-yellow">{Math.round(features.valence * 100)}%</span>
              </div>
              <Progress value={features.valence * 100} className="h-1.5" />
            </div>
          )}
        </div>
      )}
    </Card>
  );
};