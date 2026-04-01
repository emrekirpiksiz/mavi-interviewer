// Simli API Service - Realtime lip-sync avatar
// Docs: https://docs.simli.com/overview

import { SimliClient } from 'simli-client';

export class SimliService {
  private client: SimliClient;
  private apiKey: string;
  private faceId: string;
  private isInitialized = false;
  private videoElement: HTMLVideoElement | null = null;
  private audioElement: HTMLAudioElement | null = null;

  constructor(apiKey: string, faceId: string = 'tmp9i8bbq7c') {
    this.apiKey = apiKey;
    this.faceId = faceId; // Default Simli face
    
    this.client = new SimliClient();
    console.log('Simli Service created');
  }

  async initialize(videoRef: HTMLVideoElement, audioRef: HTMLAudioElement): Promise<void> {
    if (this.isInitialized) return;

    this.videoElement = videoRef;
    this.audioElement = audioRef;

    const config = {
      apiKey: this.apiKey,
      faceId: this.faceId,
      handleSilence: true,
      videoRef: videoRef,
      audioRef: audioRef,
    };

    await this.client.Initialize(config);
    this.isInitialized = true;
    console.log('Simli initialized');
  }

  async start(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Simli not initialized. Call initialize() first.');
    }
    await this.client.start();
    console.log('Simli started');
  }

  // Audio data göndererek lip-sync video oluştur
  sendAudioData(audioData: Uint8Array): void {
    if (!this.isInitialized) {
      console.warn('Simli not initialized');
      return;
    }
    this.client.sendAudioData(audioData);
  }

  close(): void {
    this.client.close();
    this.isInitialized = false;
    console.log('Simli closed');
  }

  isReady(): boolean {
    return this.isInitialized;
  }
}

// ElevenLabs audio'yu Simli'ye göndermek için yardımcı fonksiyon
export async function streamAudioToSimli(
  audioBlob: Blob,
  simliClient: SimliClient
): Promise<void> {
  const arrayBuffer = await audioBlob.arrayBuffer();
  const audioData = new Uint8Array(arrayBuffer);
  
  // Audio verisini Simli'ye gönder
  simliClient.sendAudioData(audioData);
}

