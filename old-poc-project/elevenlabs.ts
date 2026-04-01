export class ElevenLabsService {
  private apiKey: string;
  private voiceId: string;
  private currentAudio: HTMLAudioElement | null = null;

  constructor(apiKey: string, voiceId: string = 'XrExE9yKIg1WjnnlVkGX') {
    this.apiKey = apiKey;
    this.voiceId = voiceId;
  }

  setVoiceId(voiceId: string) {
    this.voiceId = voiceId;
  }

  // Simli için PCM16 formatında audio al
  async getAudioForSimli(text: string): Promise<Uint8Array> {
    console.log('ElevenLabs: Getting PCM16 audio for text:', text.substring(0, 50) + '...');
    
    // output_format URL query parameter olarak gönderilmeli!
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}?output_format=pcm_16000`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': this.apiKey
        },
        body: JSON.stringify({
          text: text,
          model_id: 'eleven_turbo_v2_5',
          // output_format artık body'de değil, URL'de
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0, // Daha doğal ses için
            use_speaker_boost: true
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API Error: ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBytes = new Uint8Array(arrayBuffer);
    console.log('ElevenLabs: Received PCM16 audio, size:', arrayBuffer.byteLength, 'bytes');
    
    // İlk 44 byte'ı kontrol et - WAV header varsa atla
    // WAV header: "RIFF" (0x52494646) ile başlar
    const hasWavHeader = audioBytes[0] === 0x52 && audioBytes[1] === 0x49 && 
                         audioBytes[2] === 0x46 && audioBytes[3] === 0x46;
    
    if (hasWavHeader) {
      console.log('ElevenLabs: WAV header detected, stripping 44 bytes');
      // WAV header 44 byte, bunu atlayarak raw PCM döndür
      return audioBytes.slice(44);
    }
    
    console.log('ElevenLabs: Raw PCM data (no WAV header)');
    console.log('First 16 bytes:', Array.from(audioBytes.slice(0, 16)));
    
    // Simli Uint8Array bekliyor (PCM16 raw bytes)
    return audioBytes;
  }

  // Standart ses çalma (fallback için)
  async speak(text: string): Promise<void> {
    this.stop();

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': this.apiKey
        },
        body: JSON.stringify({
          text: text,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.5,
            use_speaker_boost: true
          }
        })
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`ElevenLabs API Error: ${error.detail?.message || response.status}`);
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);

    return new Promise((resolve, reject) => {
      this.currentAudio = new Audio(audioUrl);
      
      this.currentAudio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        this.currentAudio = null;
        resolve();
      };

      this.currentAudio.onerror = (e) => {
        URL.revokeObjectURL(audioUrl);
        this.currentAudio = null;
        reject(e);
      };

      this.currentAudio.play();
    });
  }

  stop() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
  }
}
