export interface MixingOptions {
  crossfadeTime?: number;
  volumeBalance?: number[];
  tempoSync?: boolean;
}

export class AudioMixer {
  private audioContext: AudioContext;

  constructor() {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }

  async mixTracks(audioFiles: File[], options: MixingOptions = {}): Promise<string> {
    const {
      crossfadeTime = 2,
      volumeBalance = [],
      tempoSync = true
    } = options;

    try {
      // Decode all audio files
      const audioBuffers = await Promise.all(
        audioFiles.map(file => this.decodeAudioFile(file))
      );

      // Find the longest duration
      const maxDuration = Math.max(...audioBuffers.map(buffer => buffer.duration));
      
      // Create offline context for rendering
      const offlineContext = new OfflineAudioContext(
        2, // stereo
        Math.floor(maxDuration * this.audioContext.sampleRate),
        this.audioContext.sampleRate
      );

      // Mix the tracks with advanced processing
      audioBuffers.forEach((buffer, index) => {
        const source = offlineContext.createBufferSource();
        const gainNode = offlineContext.createGain();
        const compressor = offlineContext.createDynamicsCompressor();
        const filter = offlineContext.createBiquadFilter();
        
        source.buffer = buffer;
        
        // Advanced audio processing
        compressor.threshold.setValueAtTime(-20, 0);
        compressor.knee.setValueAtTime(6, 0);
        compressor.ratio.setValueAtTime(4, 0);
        compressor.attack.setValueAtTime(0.003, 0);
        compressor.release.setValueAtTime(0.1, 0);
        
        // High-pass filter to clean low frequencies
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(40, 0);
        
        // Set volume with dynamic range
        const volume = volumeBalance[index] !== undefined ? volumeBalance[index] : 0.8 / audioBuffers.length;
        gainNode.gain.setValueAtTime(volume, 0);
        
        // Advanced crossfade with exponential curves
        if (audioBuffers.length > 1 && index > 0) {
          gainNode.gain.setValueAtTime(0.01, 0);
          gainNode.gain.exponentialRampToValueAtTime(volume, crossfadeTime);
        }

        // Connect with professional audio chain
        source.connect(filter);
        filter.connect(compressor);
        compressor.connect(gainNode);
        gainNode.connect(offlineContext.destination);
        source.start(0);
      });

      // Render the mixed audio
      const renderedBuffer = await offlineContext.startRendering();
      
      // Convert to blob URL
      return this.bufferToUrl(renderedBuffer);
      
    } catch (error) {
      console.error('Error mixing audio:', error);
      throw new Error('Failed to mix audio tracks');
    }
  }

  private async decodeAudioFile(file: File): Promise<AudioBuffer> {
    const arrayBuffer = await file.arrayBuffer();
    return await this.audioContext.decodeAudioData(arrayBuffer);
  }

  private bufferToUrl(buffer: AudioBuffer): string {
    const numberOfChannels = buffer.numberOfChannels;
    const length = buffer.length;
    const sampleRate = buffer.sampleRate;
    
    // Create WAV file
    const arrayBuffer = new ArrayBuffer(44 + length * numberOfChannels * 2);
    const view = new DataView(arrayBuffer);
    
    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * numberOfChannels * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numberOfChannels * 2, true);
    view.setUint16(32, numberOfChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * numberOfChannels * 2, true);
    
    // Convert float samples to 16-bit PCM
    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
        view.setInt16(offset, sample * 0x7FFF, true);
        offset += 2;
      }
    }
    
    const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  }

  dispose() {
    if (this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
  }
}

export const audioMixer = new AudioMixer();