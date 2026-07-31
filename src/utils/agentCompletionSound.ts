interface CompletionTone {
  frequency: number
  pan: number
  startOffset: number
  duration: number
}

const COMPLETION_TONES: readonly CompletionTone[] = [
  { frequency: 659.25, pan: -1, startOffset: 0, duration: 0.18 },
  { frequency: 880, pan: 1, startOffset: 0.13, duration: 0.22 },
]

let audioContext: AudioContext | undefined

function getAudioContext(): AudioContext | undefined {
  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') {
    return undefined
  }

  if (!audioContext || audioContext.state === 'closed') {
    try {
      audioContext = new window.AudioContext()
    } catch {
      return undefined
    }
  }

  return audioContext
}

export function prepareAgentCompletionSound(): void {
  const context = getAudioContext()

  if (context?.state === 'suspended') {
    void context.resume().catch(() => undefined)
  }
}

export async function playAgentCompletionSound(): Promise<void> {
  const context = getAudioContext()

  if (!context) {
    return
  }

  try {
    if (context.state === 'suspended') {
      await context.resume()
    }

    if (context.state !== 'running') {
      return
    }

    const startedAt = context.currentTime + 0.02

    for (const tone of COMPLETION_TONES) {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const panner = context.createStereoPanner()
      const toneStartedAt = startedAt + tone.startOffset
      const toneEndedAt = toneStartedAt + tone.duration

      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(tone.frequency, toneStartedAt)
      panner.pan.setValueAtTime(tone.pan, toneStartedAt)
      gain.gain.setValueAtTime(0.0001, toneStartedAt)
      gain.gain.exponentialRampToValueAtTime(0.08, toneStartedAt + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, toneEndedAt)

      oscillator.connect(gain)
      gain.connect(panner)
      panner.connect(context.destination)
      oscillator.addEventListener(
        'ended',
        () => {
          oscillator.disconnect()
          gain.disconnect()
          panner.disconnect()
        },
        { once: true },
      )
      oscillator.start(toneStartedAt)
      oscillator.stop(toneEndedAt)
    }
  } catch {
    // Audio feedback is optional and must not affect the completed Agent run.
  }
}
