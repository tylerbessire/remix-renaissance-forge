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
      crossfadeTime = 3,
      volumeBalance = [],
      tempoSync = false
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

      // Mix the tracks
      audioBuffers.forEach((buffer, index) => {
        const source = offlineContext.createBufferSource();
        const gainNode = offlineContext.createGain();
        
        source.buffer = buffer;
        
        // Set volume based on balance or default
        const volume = volumeBalance[index] !== undefined ? volumeBalance[index] : 1 / audioBuffers.length;
        gainNode.gain.setValueAtTime(volume, 0);
        
        // Apply crossfade if multiple tracks
        if (audioBuffers.length > 1 && index > 0) {
          gainNode.gain.setValueAtTime(0, 0);
          gainNode.gain.linearRampToValueAtTime(volume, crossfadeTime);
        }

        // Connect and start
        source.connect(gainNode);
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