type SfxName =
  | 'tile-place'
  | 'tile-replace'
  | 'tile-invalid'
  | 'target-hit'
  | 'tile-unlock'
  | 'puzzle-unlock'
  | 'graph-complete'

interface AudioPreferences {
  muted: boolean
  musicVolume: number
  sfxVolume: number
}

const STORAGE_KEY = 'graphbound-audio-preferences'
const DEFAULT_PREFERENCES: AudioPreferences = {
  muted: false,
  musicVolume: 0.26,
  sfxVolume: 0.58,
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function loadPreferences(): AudioPreferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { ...DEFAULT_PREFERENCES }
    }

    const parsed = JSON.parse(raw) as Partial<AudioPreferences>
    return {
      muted: Boolean(parsed.muted),
      musicVolume: clamp(Number(parsed.musicVolume ?? DEFAULT_PREFERENCES.musicVolume), 0, 1),
      sfxVolume: clamp(Number(parsed.sfxVolume ?? DEFAULT_PREFERENCES.sfxVolume), 0, 1),
    }
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
}

function savePreferences(preferences: AudioPreferences): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
  } catch {
    // Local storage can be unavailable in private or embedded contexts.
  }
}

function setButtonPressed(button: HTMLButtonElement, pressed: boolean): void {
  button.setAttribute('aria-pressed', pressed ? 'true' : 'false')
}

export class AudioManager {
  private context: AudioContext | null = null
  private masterGain: GainNode | null = null
  private sfxGain: GainNode | null = null
  private musicGain: GainNode | null = null
  private readonly preferences = loadPreferences()
  private readonly root: HTMLDivElement
  private readonly panel: HTMLDivElement
  private readonly muteButton: HTMLButtonElement
  private readonly musicSlider: HTMLInputElement
  private readonly sfxSlider: HTMLInputElement
  private placeVariant = 0

  constructor() {
    this.root = document.createElement('div')
    this.root.className = 'audio-settings'

    this.muteButton = document.createElement('button')
    this.muteButton.className = 'audio-settings__button'
    this.muteButton.type = 'button'
    this.muteButton.title = 'Audio settings'
    this.muteButton.setAttribute('aria-label', 'Audio settings')

    this.panel = document.createElement('div')
    this.panel.className = 'audio-settings__panel'
    this.panel.hidden = true

    this.musicSlider = this.createSlider('Music', this.preferences.musicVolume)
    this.sfxSlider = this.createSlider('SFX', this.preferences.sfxVolume)

    this.panel.append(this.createPanelHeader(), this.musicSlider.parentElement!, this.sfxSlider.parentElement!)
    this.root.append(this.muteButton, this.panel)
    document.body.append(this.root)

    this.muteButton.addEventListener('click', () => {
      void this.unlock()
      this.preferences.muted = !this.preferences.muted
      this.applyPreferences()
      this.syncControls()
    })

    this.musicSlider.addEventListener('input', () => {
      void this.unlock()
      this.preferences.musicVolume = clamp(Number(this.musicSlider.value), 0, 1)
      this.applyPreferences()
      savePreferences(this.preferences)
    })

    this.sfxSlider.addEventListener('input', () => {
      void this.unlock()
      this.preferences.sfxVolume = clamp(Number(this.sfxSlider.value), 0, 1)
      this.applyPreferences()
      savePreferences(this.preferences)
    })

    this.root.addEventListener('mouseenter', () => {
      this.panel.hidden = false
    })
    this.root.addEventListener('mouseleave', () => {
      this.panel.hidden = true
    })
    this.root.addEventListener('focusin', () => {
      this.panel.hidden = false
    })
    this.root.addEventListener('focusout', (event) => {
      if (!this.root.contains(event.relatedTarget as Node | null)) {
        this.panel.hidden = true
      }
    })

    this.syncControls()
  }

  async unlock(): Promise<void> {
    const context = this.audioContext()
    if (context.state === 'suspended') {
      await context.resume()
    }
  }

  play(name: SfxName): void {
    if (this.preferences.muted || this.preferences.sfxVolume <= 0) {
      return
    }

    const context = this.audioContext()
    const now = context.currentTime

    if (name === 'tile-place') {
      this.playTilePlace(now)
      return
    }

    if (name === 'tile-replace') {
      this.playTilePlace(now, 1.08)
      this.playNoise(now + 0.012, 0.045, 900, 0.11)
      return
    }

    if (name === 'tile-invalid') {
      this.playDullTap(now)
      return
    }

    if (name === 'target-hit') {
      this.playTargetHit(now)
      return
    }

    if (name === 'tile-unlock') {
      this.playTileUnlock(now)
      return
    }

    if (name === 'puzzle-unlock') {
      this.playPuzzleUnlock(now)
      return
    }

    this.playGraphComplete(now)
  }

  private audioContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext()
      this.masterGain = this.context.createGain()
      this.sfxGain = this.context.createGain()
      this.musicGain = this.context.createGain()
      this.sfxGain.connect(this.masterGain)
      this.musicGain.connect(this.masterGain)
      this.masterGain.connect(this.context.destination)
      this.applyPreferences()
    }

    return this.context
  }

  private createPanelHeader(): HTMLElement {
    const header = document.createElement('div')
    header.className = 'audio-settings__title'
    header.textContent = 'Sound'
    return header
  }

  private createSlider(label: string, value: number): HTMLInputElement {
    const wrapper = document.createElement('label')
    wrapper.className = 'audio-settings__slider'
    const text = document.createElement('span')
    text.textContent = label
    const slider = document.createElement('input')
    slider.type = 'range'
    slider.min = '0'
    slider.max = '1'
    slider.step = '0.01'
    slider.value = String(value)
    wrapper.append(text, slider)
    return slider
  }

  private syncControls(): void {
    setButtonPressed(this.muteButton, this.preferences.muted)
    this.muteButton.textContent = this.preferences.muted ? 'sound off' : 'sound on'
    this.musicSlider.value = String(this.preferences.musicVolume)
    this.sfxSlider.value = String(this.preferences.sfxVolume)
    savePreferences(this.preferences)
  }

  private applyPreferences(): void {
    if (this.masterGain) {
      this.masterGain.gain.value = this.preferences.muted ? 0 : 1
    }
    if (this.sfxGain) {
      this.sfxGain.gain.value = this.preferences.sfxVolume
    }
    if (this.musicGain) {
      this.musicGain.gain.value = this.preferences.musicVolume
    }
  }

  private playTilePlace(startTime: number, pitchScale = 1): void {
    const variant = this.placeVariant
    this.placeVariant = (this.placeVariant + 1) % 5
    const baseFrequency = [178, 194, 186, 204, 172][variant] * pitchScale
    this.playNoise(startTime, 0.035, 1600, 0.16)
    this.playTone(startTime + 0.004, baseFrequency, 0.105, 0.22, 'triangle')
    this.playNoise(startTime + 0.048, 0.055, 3600, 0.045)
  }

  private playDullTap(startTime: number): void {
    this.playNoise(startTime, 0.045, 520, 0.12)
    this.playTone(startTime + 0.006, 112, 0.11, 0.12, 'sine')
  }

  private playTargetHit(startTime: number): void {
    this.playNoise(startTime, 0.04, 2100, 0.11)
    this.playTone(startTime + 0.018, 523.25, 0.16, 0.12, 'sine')
    this.playTone(startTime + 0.074, 659.25, 0.18, 0.1, 'sine')
  }

  private playTileUnlock(startTime: number): void {
    this.playNoise(startTime, 0.16, 2900, 0.12)
    this.playTone(startTime + 0.05, 392, 0.19, 0.1, 'triangle')
    this.playTone(startTime + 0.15, 523.25, 0.24, 0.1, 'triangle')
    this.playTone(startTime + 0.31, 659.25, 0.28, 0.09, 'sine')
  }

  private playPuzzleUnlock(startTime: number): void {
    this.playNoise(startTime, 0.2, 1800, 0.08)
    this.playTone(startTime + 0.06, 293.66, 0.24, 0.07, 'triangle')
    this.playTone(startTime + 0.2, 392, 0.28, 0.06, 'triangle')
  }

  private playGraphComplete(startTime: number): void {
    this.playTone(startTime, 329.63, 0.16, 0.08, 'triangle')
    this.playTone(startTime + 0.09, 392, 0.2, 0.08, 'triangle')
    this.playTone(startTime + 0.2, 523.25, 0.24, 0.075, 'sine')
  }

  private playTone(
    startTime: number,
    frequency: number,
    duration: number,
    volume: number,
    type: OscillatorType,
  ): void {
    const context = this.audioContext()
    const oscillator = context.createOscillator()
    const gain = context.createGain()

    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, startTime)
    gain.gain.setValueAtTime(0.0001, startTime)
    gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)

    oscillator.connect(gain)
    gain.connect(this.sfxGain!)
    oscillator.start(startTime)
    oscillator.stop(startTime + duration + 0.03)
  }

  private playNoise(startTime: number, duration: number, cutoff: number, volume: number): void {
    const context = this.audioContext()
    const sampleCount = Math.max(1, Math.floor(context.sampleRate * duration))
    const buffer = context.createBuffer(1, sampleCount, context.sampleRate)
    const samples = buffer.getChannelData(0)

    for (let index = 0; index < sampleCount; index += 1) {
      samples[index] = (Math.random() * 2 - 1) * (1 - index / sampleCount)
    }

    const source = context.createBufferSource()
    const filter = context.createBiquadFilter()
    const gain = context.createGain()

    source.buffer = buffer
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(cutoff, startTime)
    gain.gain.setValueAtTime(volume, startTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)

    source.connect(filter)
    filter.connect(gain)
    gain.connect(this.sfxGain!)
    source.start(startTime)
    source.stop(startTime + duration + 0.02)
  }
}
