import { pipeline, env } from '@huggingface/transformers';

// Configure transformers.js for optimal performance
env.allowLocalModels = false;
env.useBrowserCache = true;

export interface AudioFeatures {
  tempo?: number;
  energy?: number;
  danceability?: number;
  valence?: number; // musical positivity
  genre?: string;
  key?: string;
  mode?: 'major' | 'minor';
  timeSignature?: number;
  loudness?: number;
  speechiness?: number;
  acousticness?: number;
  instrumentalness?: number;
  liveness?: number;
}

export interface AudioAnalysisResult {
  features: AudioFeatures;
  transcription?: string;
  classification?: string;
  confidence?: number;
}

class AudioAnalyzer {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private classifier: any = null;
  private transcriber: any = null;

  async initialize() {
    try {
      // Initialize Web Audio API
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;

      console.log('Loading AI models...');
      
      // Load audio classification model (lightweight)
      this.classifier = await pipeline(
        'audio-classification',
        'MIT/ast-finetuned-audioset-10-10-0.4593',
        { device: 'webgpu' }
      );

      // Load speech recognition model (tiny for speed)
      this.transcriber = await pipeline(
        'automatic-speech-recognition',
        'onnx-community/whisper-tiny.en',
        { device: 'webgpu' }
      );

      console.log('Audio analysis models loaded successfully');
    } catch (error) {
      console.warn('WebGPU not available, falling back to CPU:', error);
      
      // Fallback to CPU
      this.classifier = await pipeline(
        'audio-classification',
        'MIT/ast-finetuned-audioset-10-10-0.4593'
      );

      this.transcriber = await pipeline(
        'automatic-speech-recognition',
        'onnx-community/whisper-tiny.en'
      );
    }
  }

  async analyzeFile(file: File): Promise<AudioAnalysisResult> {
    if (!this.audioContext || !this.classifier) {
      await this.initialize();
    }

    console.log('Analyzing audio file:', file.name);

    try {
      // Convert file to audio buffer
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await this.audioContext!.decodeAudioData(arrayBuffer);
      
      // Extract basic features using Web Audio API
      const features = this.extractBasicFeatures(audioBuffer);
      
      // Create URL for AI model processing
      const audioUrl = URL.createObjectURL(file);
      
      // Run AI analysis in parallel
      const [classificationResult, transcriptionResult] = await Promise.allSettled([
        this.classifier(audioUrl),
        this.transcriber(audioUrl)
      ]);

      // Process classification results
      let classification = 'Unknown';
      let confidence = 0;
      
      if (classificationResult.status === 'fulfilled' && classificationResult.value?.[0]) {
        classification = classificationResult.value[0].label;
        confidence = classificationResult.value[0].score;
        
        // Map classification to genre
        features.genre = this.mapClassificationToGenre(classification);
      }

      // Process transcription results
      let transcription = '';
      if (transcriptionResult.status === 'fulfilled' && transcriptionResult.value?.text) {
        transcription = transcriptionResult.value.text;
      }

      // Clean up
      URL.revokeObjectURL(audioUrl);

      console.log('Audio analysis complete:', { features, classification, confidence });

      return {
        features,
        transcription,
        classification,
        confidence
      };
    } catch (error) {
      console.error('Error analyzing audio:', error);
      throw new Error('Failed to analyze audio file');
    }
  }

  private extractBasicFeatures(audioBuffer: AudioBuffer): AudioFeatures {
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    
    // Calculate RMS energy
    let sumSquares = 0;
    for (let i = 0; i < channelData.length; i++) {
      sumSquares += channelData[i] * channelData[i];
    }
    const rms = Math.sqrt(sumSquares / channelData.length);
    const energy = Math.min(1, rms * 10); // Normalize to 0-1

    // Estimate tempo using zero-crossing rate
    let zeroCrossings = 0;
    for (let i = 1; i < channelData.length; i++) {
      if ((channelData[i] >= 0) !== (channelData[i - 1] >= 0)) {
        zeroCrossings++;
      }
    }
    const zcr = zeroCrossings / (channelData.length - 1);
    const estimatedTempo = Math.min(200, Math.max(60, zcr * sampleRate * 60 / 4));

    // Calculate loudness (average amplitude)
    const loudness = channelData.reduce((sum, sample) => sum + Math.abs(sample), 0) / channelData.length;

    // Estimate musical features based on audio characteristics
    const danceability = Math.min(1, energy * 0.8 + (estimatedTempo - 60) / 140 * 0.2);
    const valence = Math.min(1, energy * 0.6 + (1 - zcr) * 0.4); // Higher energy + lower complexity = more positive
    
    return {
      tempo: Math.round(estimatedTempo),
      energy: Math.round(energy * 100) / 100,
      danceability: Math.round(danceability * 100) / 100,
      valence: Math.round(valence * 100) / 100,
      loudness: Math.round(loudness * 100) / 100,
      speechiness: zcr > 0.1 ? Math.min(1, zcr * 2) : 0, // High ZCR suggests speech
      acousticness: energy < 0.3 ? 0.7 : 0.3, // Low energy suggests acoustic
      instrumentalness: 0.5, // Default to middle ground
      liveness: energy > 0.7 ? 0.8 : 0.2, // High energy suggests live performance
      timeSignature: 4 // Default to 4/4
    };
  }

  private mapClassificationToGenre(classification: string): string {
    const genreMap: { [key: string]: string } = {
      'music': 'Electronic',
      'speech': 'Spoken Word',
      'singing': 'Pop',
      'guitar': 'Rock',
      'piano': 'Classical',
      'drum': 'Hip Hop',
      'bass': 'Electronic',
      'violin': 'Classical',
      'trumpet': 'Jazz',
      'saxophone': 'Jazz',
      'electronic': 'Electronic',
      'rock': 'Rock',
      'pop': 'Pop',
      'classical': 'Classical',
      'jazz': 'Jazz',
      'hip hop': 'Hip Hop',
      'country': 'Country',
      'blues': 'Blues',
      'reggae': 'Reggae',
      'folk': 'Folk'
    };

    const lowerClassification = classification.toLowerCase();
    
    for (const [key, genre] of Object.entries(genreMap)) {
      if (lowerClassification.includes(key)) {
        return genre;
      }
    }
    
    return 'Other';
  }

  async analyzeCompatibility(songs: AudioAnalysisResult[]): Promise<{
    score: number;
    reasons: string[];
    suggestions: string[];
  }> {
    if (songs.length < 2) {
      return { score: 0, reasons: ['Need at least 2 songs'], suggestions: [] };
    }

    const features = songs.map(s => s.features);
    let compatibilityScore = 0;
    const reasons: string[] = [];
    const suggestions: string[] = [];

    // Tempo compatibility (30% weight)
    const tempos = features.map(f => f.tempo || 120);
    const tempoRange = Math.max(...tempos) - Math.min(...tempos);
    const tempoScore = Math.max(0, 1 - tempoRange / 60); // Perfect if within 60 BPM
    compatibilityScore += tempoScore * 0.3;
    
    if (tempoScore > 0.8) {
      reasons.push('Similar tempos create smooth transitions');
    } else if (tempoScore < 0.4) {
      reasons.push('Tempo differences may create challenging transitions');
      suggestions.push('Consider tempo matching or gradual transitions');
    }

    // Energy compatibility (25% weight)
    const energies = features.map(f => f.energy || 0.5);
    const energyVariance = this.calculateVariance(energies);
    const energyScore = Math.max(0, 1 - energyVariance * 4);
    compatibilityScore += energyScore * 0.25;

    if (energyScore > 0.7) {
      reasons.push('Similar energy levels work well together');
    } else {
      suggestions.push('Mix high and low energy sections for dynamic contrast');
    }

    // Genre compatibility (20% weight)
    const genres = features.map(f => f.genre || 'Other');
    const uniqueGenres = [...new Set(genres)];
    const genreScore = uniqueGenres.length <= 2 ? 1 : Math.max(0, 1 - (uniqueGenres.length - 2) * 0.3);
    compatibilityScore += genreScore * 0.2;

    if (genreScore > 0.8) {
      reasons.push('Compatible genres blend naturally');
    } else {
      suggestions.push('Cross-genre mashups can be innovative but challenging');
    }

    // Musical key compatibility (15% weight) - simplified
    const keyScore = 0.7; // Placeholder - would need more complex key detection
    compatibilityScore += keyScore * 0.15;

    // Danceability compatibility (10% weight)
    const danceabilities = features.map(f => f.danceability || 0.5);
    const danceabilityVariance = this.calculateVariance(danceabilities);
    const danceabilityScore = Math.max(0, 1 - danceabilityVariance * 2);
    compatibilityScore += danceabilityScore * 0.1;

    // Final score (0-100)
    const finalScore = Math.round(compatibilityScore * 100);

    // Add overall assessment
    if (finalScore >= 80) {
      reasons.push('🔥 Excellent mashup potential!');
    } else if (finalScore >= 60) {
      reasons.push('✨ Good mashup compatibility');
    } else if (finalScore >= 40) {
      reasons.push('⚡ Creative potential with some challenges');
    } else {
      reasons.push('🎯 Experimental mashup - requires creativity');
    }

    return {
      score: finalScore,
      reasons,
      suggestions
    };
  }

  private calculateVariance(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
    return variance;
  }
}

// Export singleton instance
export const audioAnalyzer = new AudioAnalyzer();