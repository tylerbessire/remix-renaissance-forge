import React, { useState, useEffect } from 'react';
import { useAudioAnalysis } from '@/hooks/useAudioAnalysis';
import { useMashabilityScoring } from '@/hooks/useMashabilityScoring';
import { useMashupOrchestrator } from '@/hooks/useMashupOrchestrator';
import { MashabilityDisplay } from '@/components/mashability/MashabilityDisplay';
import { Button } from '@/components/ui/button';

const SongUploader: React.FC<{ songNumber: 1 | 2, onFileUpload: (file: File) => void, analysis: any | null, isAnalyzing: boolean }> =
({ songNumber, onFileUpload, analysis, isAnalyzing }) => {
    return (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Song {songNumber}</h3>
            <input
                type="file"
                accept="audio/*"
                onChange={(e) => e.target.files?.[0] && onFileUpload(e.target.files[0])}
                className="w-full"
                disabled={isAnalyzing}
            />
            {isAnalyzing && <div className="mt-2 text-blue-500">Analyzing...</div>}
            {analysis && <div className="mt-2 text-green-600">✅ Analysis Complete!</div>}
        </div>
    );
};

export const MashupStudio: React.FC = () => {
    // State for the two songs
    const [song1, setSong1] = useState<{ id: string, file: File | null }>({ id: 'song1', file: null });
    const [song2, setSong2] = useState<{ id: string, file: File | null }>({ id: 'song2', file: null });

    // Our three main hooks
    const { analyzedSongs, analyzeSong, isAnalyzing } = useAudioAnalysis();
    const { score, calculateMashability, isCalculating: isScoring } = useMashabilityScoring();
    const orchestrator = useMashupOrchestrator();

    const song1Analysis = analyzedSongs.get('song1') || null;
    const song2Analysis = analyzedSongs.get('song2') || null;

    // --- Step 1: File Upload & Analysis ---
    const handleFileUpload = (file: File, songNumber: 1 | 2) => {
        if (songNumber === 1) {
            const newSong = { id: 'song1', file };
            setSong1(newSong);
            analyzeSong(newSong);
        } else {
            const newSong = { id: 'song2', file };
            setSong2(newSong);
            analyzeSong(newSong);
        }
    };

    // --- Step 2: Calculate Mashability when both songs are analyzed ---
    useEffect(() => {
        if (song1Analysis && song2Analysis) {
            calculateMashability(song1Analysis, song2Analysis);
        }
    }, [song1Analysis, song2Analysis, calculateMashability]);

    // --- Step 3: Create Masterplan when scoring is done ---
    const handleCreateMasterplan = () => {
        if (song1Analysis && song2Analysis && score) {
            orchestrator.createMasterplan(song1Analysis, song2Analysis, score);
        }
    };

    // --- Step 4: Execute the masterplan ---
    const handleExecuteMasterplan = () => {
        // A real implementation would need to pass the song info and a job id
        orchestrator.executeMasterplan([], "job123");
    };

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-8">
            <h1 className="text-4xl font-bold text-center tracking-tighter">Kill_mR_DJ: Mashup Studio</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <SongUploader songNumber={1} onFileUpload={(f) => handleFileUpload(f, 1)} analysis={song1Analysis} isAnalyzing={isAnalyzing} />
                <SongUploader songNumber={2} onFileUpload={(f) => handleFileUpload(f, 2)} analysis={song2Analysis} isAnalyzing={isAnalyzing} />
            </div>

            {score && <MashabilityDisplay mashabilityResult={score} onWeightsChange={() => {}} />}

            {score && !orchestrator.masterplan && (
                <div className="text-center">
                    <Button onClick={handleCreateMasterplan} disabled={orchestrator.isCreating}>
                        {orchestrator.isCreating ? 'AI is Generating Masterplan...' : 'Create AI Masterplan'}
                    </Button>
                </div>
            )}

            {orchestrator.masterplan && (
                <div className="p-6 bg-gray-900 text-white rounded-lg space-y-4">
                    <h3 className="text-2xl font-bold">Creative Vision:</h3>
                    <p className="text-gray-300 italic">"{orchestrator.creativeVision}"</p>
                    <h4 className="text-xl font-bold pt-4">Masterplan:</h4>
                    <pre className="bg-black p-4 rounded-md overflow-x-auto text-sm">
                        {JSON.stringify(orchestrator.masterplan, null, 2)}
                    </pre>
                    <div className="text-center pt-4">
                        <Button onClick={handleExecuteMasterplan} disabled={orchestrator.isExecuting} variant="destructive">
                            {orchestrator.isExecuting ? `Executing... ${orchestrator.executionProgress}%` : 'Execute Masterplan & Render Audio'}
                        </Button>
                    </div>
                </div>
            )}

            {orchestrator.isExecuting && (
                <div className="p-4 bg-blue-900 text-white rounded-lg">
                    <p>Progress: {orchestrator.executionProgress}%</p>
                    <p className="text-sm text-blue-300">{orchestrator.executionMessage}</p>
                </div>
            )}

            {orchestrator.finalAudioUrl && (
                 <div className="p-6 bg-green-900 text-white rounded-lg space-y-4 text-center">
                    <h3 className="text-2xl font-bold">Mashup Complete!</h3>
                    <audio controls src={orchestrator.finalAudioUrl} className="w-full" />
                 </div>
            )}

        </div>
    );
};
