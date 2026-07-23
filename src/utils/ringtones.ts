class RingtonePlayer {
  private audioContext: AudioContext | null = null
  private isPlaying = false
  private intervalId: any = null
  private vibrateInterval: any = null
  private oscillators: OscillatorNode[] = []

  private getContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === "closed") {
      this.audioContext = new (window.AudioContext || 
        (window as any).webkitAudioContext)()
    }
    if (this.audioContext.state === "suspended") {
      this.audioContext.resume()
    }
    return this.audioContext
  }

  private playTone(
    frequency: number,
    startTime: number,
    duration: number,
    volume: number = 0.15
  ) {
    const ctx = this.getContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = "sine"
    osc.frequency.value = frequency
    
    gain.gain.setValueAtTime(0, ctx.currentTime + startTime)
    gain.gain.linearRampToValueAtTime(
      volume, ctx.currentTime + startTime + 0.05
    )
    gain.gain.linearRampToValueAtTime(
      volume, ctx.currentTime + startTime + duration - 0.08
    )
    gain.gain.linearRampToValueAtTime(
      0, ctx.currentTime + startTime + duration
    )

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(ctx.currentTime + startTime)
    osc.stop(ctx.currentTime + startTime + duration)

    this.oscillators.push(osc)
  }

  // Incoming call ring — two-tone WhatsApp-style pattern
  startIncomingRing() {
    if (this.isPlaying) return
    this.isPlaying = true

    const playCycle = () => {
      if (!this.isPlaying) return
      // Two quick ascending tones then pause
      this.playTone(587.33, 0, 0.35, 0.18)    // D5
      this.playTone(739.99, 0.4, 0.35, 0.18)  // F#5
      this.playTone(587.33, 1.0, 0.35, 0.18)
      this.playTone(739.99, 1.4, 0.35, 0.18)
    }

    playCycle()
    this.intervalId = setInterval(playCycle, 2200)

    // Also vibrate on supported devices
    if ("vibrate" in navigator) {
      const vibratePattern = () => {
        if (this.isPlaying) navigator.vibrate([400, 200, 400, 1200])
      }
      vibratePattern()
      this.vibrateInterval = setInterval(vibratePattern, 2200)
    }
  }

  // Outgoing call tone — softer single repeating beep
  startOutgoingRing() {
    if (this.isPlaying) return
    this.isPlaying = true

    const playCycle = () => {
      if (!this.isPlaying) return
      this.playTone(440, 0, 1.0, 0.1)
    }

    playCycle()
    this.intervalId = setInterval(playCycle, 3000)
  }

  stop() {
    this.isPlaying = false
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    if (this.vibrateInterval) {
      clearInterval(this.vibrateInterval)
      this.vibrateInterval = null
    }
    if ("vibrate" in navigator) {
      navigator.vibrate(0)
    }
    this.oscillators = []
  }
}

export const ringtonePlayer = new RingtonePlayer()
