
class GlobalAudioManager {
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private currentUrl: string | null = null;

  /**
   * Stops any currently playing audio (HTML Audio or SpeechSynthesis).
   */
  public stopAll() {
    // 1. Stop HTML Audio
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
    
    // Revoke object URL
    if (this.currentUrl) {
        URL.revokeObjectURL(this.currentUrl);
        this.currentUrl = null;
    }

    // 2. Stop Speech Synthesis
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
    this.currentUtterance = null;
  }

  // ... playUrl implementation remains same ...
  public async playUrl(url: string, rate: number = 1, isBlob: boolean = false): Promise<void> {
    console.log('[AudioManager] playUrl called')
    this.stopAll(); 

    if (isBlob) {
        this.currentUrl = url;
    }

    return new Promise((resolve) => {
        const audio = new Audio(url);
        this.currentAudio = audio;
        
        try { 
            if (Number.isFinite(rate)) {
                audio.playbackRate = rate; 
            }
        } catch(e) {}

        const cleanup = () => {
             if (this.currentAudio === audio) {
                 this.currentAudio = null;
             }
             resolve();
        }

        audio.onended = () => {
             console.log('[AudioManager] playUrl finished (onended)')
             cleanup();
        };
        
        audio.onerror = (e) => {
            console.error("[AudioManager] Playback error:", e);
            cleanup();
        };

        audio.play().catch(e => {
            if (e.name !== 'AbortError') {
                console.warn("[AudioManager] Play failed:", e);
            }
            cleanup();
        });
    });
  }

  /**
   * Plays text using Edge TTS (via IPC) or fallback to SpeechSynthesis.
   * Stops any previous audio.
   */
  public async playTts(text: string, rate: number = 1): Promise<void> {
    console.log('[AudioManager] playTts called:', text.substring(0, 20))
    
    const cleanText = text.replace(/<[^>]*>/g, '');
    if (!cleanText) {
        return;
    }

    // 1. Try Edge TTS
    try {
      const result = await window.api.getTtsAudio(cleanText);
      if (result.success && result.data) {
          console.log('[AudioManager] Edge TTS success')
          const binaryString = window.atob(result.data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: result.mimeType || 'audio/mpeg' });
          const url = URL.createObjectURL(blob);
          
          return this.playUrl(url, rate, true);
      }
    } catch (e) {
      console.warn("[AudioManager] Edge TTS failed, falling back", e);
    }

    // 2. Fallback to SpeechSynthesis
    console.log('[AudioManager] Fallback to SpeechSynthesis')
    this.stopAll();
    
    return new Promise((resolve) => {
        const utterance = new SpeechSynthesisUtterance(cleanText);
        this.currentUtterance = utterance; // Retain reference!

        utterance.lang = 'en-US';
        utterance.rate = rate * 0.9;

        const voices = window.speechSynthesis.getVoices();
        const voice = voices.find(v => v.name.includes('Google') && v.lang.includes('en')) || voices.find(v => v.lang === 'en-US');
        if (voice) utterance.voice = voice;

        // Safety timeout
        const timeoutId = setTimeout(() => {
             console.warn('[AudioManager] SpeechSynthesis timeout')
             if (this.currentUtterance === utterance) {
                 resolve(); // Only resolve if still active
             }
        }, 8000);

        utterance.onend = () => {
            console.log('[AudioManager] SpeechSynthesis finished')
            clearTimeout(timeoutId);
            if (this.currentUtterance === utterance) {
                this.currentUtterance = null;
            }
            resolve();
        };
        
        utterance.onerror = (e) => {
            clearTimeout(timeoutId);
            console.error("[AudioManager] SpeechSynthesis error", e);
            if (this.currentUtterance === utterance) {
                 this.currentUtterance = null;
            }
            resolve();
        };

        window.speechSynthesis.speak(utterance);
    });
  }
}

export const audioManager = new GlobalAudioManager();
