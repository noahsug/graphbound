type SfxName =
  | 'tile-place'
  | 'tile-replace'
  | 'tile-invalid'
  | 'target-hit'
  | 'tile-unlock'
  | 'puzzle-unlock'
  | 'graph-complete'

type MusicTrackId = 'meadow' | 'lantern' | 'paper'

interface AudioPreferences {
  muted: boolean
  musicVolume: number
  sfxVolume: number
  musicTrack: MusicTrackId
}

interface AudioManagerOptions {
  onResetProgress?: () => void
}

const STORAGE_KEY = 'graphbound-audio-preferences'
const MAX_VOLUME_SETTING = 1
const MAX_VOLUME_GAIN = 1.6
const DEFAULT_PREFERENCES: AudioPreferences = {
  muted: false,
  musicVolume: 0.5,
  sfxVolume: 0.5,
  musicTrack: 'meadow',
}
const MUSIC_STEP_DELAY_MS = 150
const AMBIENT_MUSIC_LOOP_STEPS = 320
const VICTORY_MUSIC_LOOP_STEPS = 160
const MUSIC_PHRASE_STEPS = 32
const MUSIC_TRACKS: Array<{ id: MusicTrackId; label: string }> = [
  { id: 'meadow', label: 'Meadow' },
  { id: 'lantern', label: 'Lantern' },
  { id: 'paper', label: 'Paper Boat' },
]

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function gainForVolumeSetting(volume: number): number {
  const normalized = clamp(volume, 0, MAX_VOLUME_SETTING)
  return normalized * (1 + (MAX_VOLUME_GAIN - 1) * normalized ** 2)
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
      musicVolume: clamp(
        Number(parsed.musicVolume ?? DEFAULT_PREFERENCES.musicVolume),
        0,
        MAX_VOLUME_SETTING,
      ),
      sfxVolume: clamp(
        Number(parsed.sfxVolume ?? DEFAULT_PREFERENCES.sfxVolume),
        0,
        MAX_VOLUME_SETTING,
      ),
      musicTrack: validMusicTrack(parsed.musicTrack),
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

function validMusicTrack(value: unknown): MusicTrackId {
  return MUSIC_TRACKS.find((track) => track.id === value)?.id ?? DEFAULT_PREFERENCES.musicTrack
}

export class AudioManager {
  private context: AudioContext | null = null
  private masterGain: GainNode | null = null
  private sfxGain: GainNode | null = null
  private musicGain: GainNode | null = null
  private musicDuckGain: GainNode | null = null
  private readonly preferences = loadPreferences()
  private readonly onResetProgress: (() => void) | undefined
  private readonly root: HTMLDivElement
  private readonly panel: HTMLDivElement
  private readonly settingsButton: HTMLButtonElement
  private readonly muteButton: HTMLButtonElement
  private readonly trackButton: HTMLButtonElement
  private readonly resetButton: HTMLButtonElement
  private readonly resetDialog: HTMLDialogElement
  private readonly confirmResetButton: HTMLButtonElement
  private readonly cancelResetButton: HTMLButtonElement
  private readonly musicSlider: HTMLInputElement
  private readonly sfxSlider: HTMLInputElement
  private placeVariant = 0
  private musicStep = 0
  private victoryMode = false
  private musicTimeout: number | null = null
  private audioUnlocked = false
  private pageAudioPaused = false

  constructor(options: AudioManagerOptions = {}) {
    this.onResetProgress = options.onResetProgress
    this.root = document.createElement('div')
    this.root.className = 'audio-settings'

    this.settingsButton = document.createElement('button')
    this.settingsButton.className = 'audio-settings__button'
    this.settingsButton.type = 'button'
    this.settingsButton.title = 'Settings'
    this.settingsButton.textContent = '⚙'
    this.settingsButton.setAttribute('aria-label', 'Settings')
    this.settingsButton.setAttribute('aria-expanded', 'false')

    this.muteButton = document.createElement('button')
    this.muteButton.className = 'audio-settings__menu-button'
    this.muteButton.type = 'button'
    this.muteButton.setAttribute('aria-label', 'Mute audio')

    this.trackButton = document.createElement('button')
    this.trackButton.className = 'audio-settings__menu-button'
    this.trackButton.type = 'button'
    this.trackButton.setAttribute('aria-label', 'Change music track')

    this.resetButton = document.createElement('button')
    this.resetButton.className = 'audio-settings__menu-button audio-settings__menu-button--danger'
    this.resetButton.type = 'button'
    this.resetButton.textContent = 'Reset progress'

    this.resetDialog = document.createElement('dialog')
    this.resetDialog.className = 'audio-settings__confirm-dialog'
    this.resetDialog.setAttribute('aria-label', 'Confirm reset progress')

    const resetDialogTitle = document.createElement('div')
    resetDialogTitle.className = 'audio-settings__confirm-title'
    resetDialogTitle.textContent = 'Reset progress?'

    const resetDialogText = document.createElement('p')
    resetDialogText.className = 'audio-settings__confirm-text'
    resetDialogText.textContent = 'This clears your solved puzzles and returns you to the beginning.'

    const resetDialogActions = document.createElement('div')
    resetDialogActions.className = 'audio-settings__confirm-actions'

    this.cancelResetButton = document.createElement('button')
    this.cancelResetButton.className = 'audio-settings__confirm-button'
    this.cancelResetButton.type = 'button'
    this.cancelResetButton.textContent = 'No'

    this.confirmResetButton = document.createElement('button')
    this.confirmResetButton.className = 'audio-settings__confirm-button audio-settings__confirm-button--danger'
    this.confirmResetButton.type = 'button'
    this.confirmResetButton.textContent = 'Yes'

    resetDialogActions.append(this.cancelResetButton, this.confirmResetButton)
    this.resetDialog.append(resetDialogTitle, resetDialogText, resetDialogActions)

    this.panel = document.createElement('div')
    this.panel.className = 'audio-settings__panel'
    this.panel.hidden = true
    this.panel.id = 'graphbound-settings-panel'
    this.settingsButton.setAttribute('aria-controls', this.panel.id)

    this.musicSlider = this.createSlider('Music', this.preferences.musicVolume)
    this.sfxSlider = this.createSlider('SFX', this.preferences.sfxVolume)

    this.panel.append(
      this.createPanelHeader(),
      this.muteButton,
      this.trackButton,
      this.musicSlider.parentElement!,
      this.sfxSlider.parentElement!,
      this.resetButton,
    )
    this.root.append(this.settingsButton, this.panel)
    document.body.append(this.root, this.resetDialog)

    this.settingsButton.addEventListener('click', () => {
      void this.unlock()
      this.setPanelOpen(this.panel.hidden)
    })

    this.muteButton.addEventListener('click', () => {
      void this.unlock()
      this.preferences.muted = !this.preferences.muted
      this.applyPreferences()
      this.syncControls()
      this.ensureMusicStarted()
    })

    this.trackButton.addEventListener('click', () => {
      void this.unlock()
      this.advanceMusicTrack()
      this.syncControls()
      this.ensureMusicStarted()
    })

    this.resetButton.addEventListener('click', () => {
      this.setPanelOpen(false)
      this.showResetConfirmation()
    })

    this.cancelResetButton.addEventListener('click', () => {
      this.closeResetConfirmation()
    })

    this.confirmResetButton.addEventListener('click', () => {
      this.onResetProgress?.()
      this.closeResetConfirmation()
    })

    this.musicSlider.addEventListener('input', () => {
      void this.unlock()
      this.preferences.musicVolume = clamp(Number(this.musicSlider.value), 0, MAX_VOLUME_SETTING)
      this.applyPreferences()
      savePreferences(this.preferences)
      this.ensureMusicStarted()
    })

    this.sfxSlider.addEventListener('input', () => {
      void this.unlock()
      this.preferences.sfxVolume = clamp(Number(this.sfxSlider.value), 0, MAX_VOLUME_SETTING)
      this.applyPreferences()
      savePreferences(this.preferences)
    })

    this.root.addEventListener('focusout', (event) => {
      if (!this.root.contains(event.relatedTarget as Node | null)) {
        this.setPanelOpen(false)
      }
    })
    document.addEventListener('visibilitychange', this.handleVisibilityChange)
    window.addEventListener('pagehide', this.handlePageHide)
    window.addEventListener('pageshow', this.handlePageShow)

    this.syncControls()
  }

  async unlock(): Promise<void> {
    const context = this.audioContext()
    this.audioUnlocked = true

    if (this.isPageHidden()) {
      this.pauseForPageHidden()
      return
    }

    if (context.state === 'suspended') {
      await context.resume()
    }
    this.ensureMusicStarted()
  }

  setVictoryMusic(active: boolean): void {
    if (this.victoryMode === active) {
      return
    }

    this.victoryMode = active
    this.musicStep = 0
  }

  playVictoryMusic(): void {
    this.setVictoryMusic(true)
    void this.unlock()
  }

  play(name: SfxName): void {
    if (this.preferences.muted || this.preferences.sfxVolume <= 0 || this.isPageHidden()) {
      return
    }

    const context = this.audioContext()
    const now = context.currentTime
    if (['target-hit', 'tile-unlock', 'puzzle-unlock', 'graph-complete'].includes(name)) {
      this.duckMusic(name === 'target-hit' ? 520 : 980)
    }

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

  private setPanelOpen(open: boolean): void {
    this.panel.hidden = !open
    this.settingsButton.setAttribute('aria-expanded', open ? 'true' : 'false')
  }

  private showResetConfirmation(): void {
    if (this.resetDialog.open) {
      return
    }

    this.resetDialog.showModal()
    this.cancelResetButton.focus()
  }

  private closeResetConfirmation(): void {
    if (this.resetDialog.open) {
      this.resetDialog.close()
    }
  }

  private isPageHidden(): boolean {
    return document.hidden || document.visibilityState === 'hidden'
  }

  private clearMusicTimer(): void {
    if (this.musicTimeout === null) {
      return
    }

    window.clearTimeout(this.musicTimeout)
    this.musicTimeout = null
  }

  private pauseForPageHidden(): void {
    this.clearMusicTimer()

    if (!this.context || !this.audioUnlocked) {
      return
    }

    this.pageAudioPaused = true
    if (this.context.state !== 'running') {
      return
    }

    const context = this.context
    void context.suspend().then(() => {
      if (!this.isPageHidden() && this.audioUnlocked) {
        void this.resumeAfterPageVisible(true)
      }
    }).catch(() => {
      // Browsers can reject suspend/resume while a page is changing lifecycle state.
    })
  }

  private async resumeAfterPageVisible(force = false): Promise<void> {
    if (!force && !this.pageAudioPaused) {
      return
    }

    this.pageAudioPaused = false

    if (!this.context || !this.audioUnlocked || this.preferences.muted) {
      return
    }

    if (this.context.state === 'suspended') {
      try {
        await this.context.resume()
      } catch {
        return
      }
    }

    this.ensureMusicStarted()
  }

  private handleVisibilityChange = (): void => {
    if (this.isPageHidden()) {
      this.pauseForPageHidden()
      return
    }

    void this.resumeAfterPageVisible()
  }

  private handlePageHide = (): void => {
    this.pauseForPageHidden()
  }

  private handlePageShow = (): void => {
    if (!this.isPageHidden()) {
      void this.resumeAfterPageVisible()
    }
  }

  private audioContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext()
      this.masterGain = this.context.createGain()
      this.sfxGain = this.context.createGain()
      this.musicGain = this.context.createGain()
      this.musicDuckGain = this.context.createGain()
      this.sfxGain.connect(this.masterGain)
      this.musicGain.connect(this.musicDuckGain)
      this.musicDuckGain.connect(this.masterGain)
      this.masterGain.connect(this.context.destination)
      this.applyPreferences()
    }

    return this.context
  }

  private createPanelHeader(): HTMLElement {
    const header = document.createElement('div')
    header.className = 'audio-settings__title'
    header.textContent = 'Settings'
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
    slider.max = String(MAX_VOLUME_SETTING)
    slider.step = '0.01'
    slider.value = String(value)
    wrapper.append(text, slider)
    return slider
  }

  private syncControls(): void {
    const track = this.currentMusicTrack()
    this.settingsButton.textContent = '⚙'
    setButtonPressed(this.muteButton, this.preferences.muted)
    this.muteButton.textContent = this.preferences.muted ? 'Unmute' : 'Mute'
    this.muteButton.setAttribute('aria-label', this.preferences.muted ? 'Unmute audio' : 'Mute audio')
    this.trackButton.textContent = `Track: ${track.label}`
    this.trackButton.setAttribute('title', `Music track: ${track.label}`)
    this.musicSlider.value = String(this.preferences.musicVolume)
    this.sfxSlider.value = String(this.preferences.sfxVolume)
    savePreferences(this.preferences)
  }

  private currentMusicTrack(): { id: MusicTrackId; label: string } {
    return MUSIC_TRACKS.find((track) => track.id === this.preferences.musicTrack) ?? MUSIC_TRACKS[0]
  }

  private advanceMusicTrack(): void {
    const currentIndex = MUSIC_TRACKS.findIndex((track) => track.id === this.preferences.musicTrack)
    const nextTrack = MUSIC_TRACKS[(currentIndex + 1) % MUSIC_TRACKS.length]
    this.preferences.musicTrack = nextTrack.id
    this.musicStep = 0
    savePreferences(this.preferences)
  }

  private applyPreferences(): void {
    if (this.masterGain) {
      this.masterGain.gain.value = this.preferences.muted ? 0 : 1
    }
    if (this.sfxGain) {
      this.sfxGain.gain.value = gainForVolumeSetting(this.preferences.sfxVolume)
    }
    if (this.musicGain) {
      this.musicGain.gain.value = gainForVolumeSetting(this.preferences.musicVolume)
    }
    if (this.musicDuckGain) {
      this.musicDuckGain.gain.value = 1
    }
  }

  private ensureMusicStarted(): void {
    if (
      !this.context ||
      this.context.state !== 'running' ||
      this.preferences.muted ||
      this.preferences.musicVolume <= 0 ||
      this.isPageHidden() ||
      this.musicTimeout !== null
    ) {
      return
    }

    this.scheduleMusicTick(MUSIC_STEP_DELAY_MS)
  }

  private scheduleMusicTick(delayMs: number): void {
    if (this.isPageHidden()) {
      return
    }

    this.musicTimeout = window.setTimeout(() => {
      this.musicTimeout = null
      this.playMusicStep()
      this.ensureMusicStarted()
    }, delayMs)
  }

  private playMusicStep(): void {
    if (
      !this.context ||
      !this.musicGain ||
      this.preferences.muted ||
      this.preferences.musicVolume <= 0 ||
      this.isPageHidden()
    ) {
      return
    }

    const loopSteps = this.victoryMode ? VICTORY_MUSIC_LOOP_STEPS : AMBIENT_MUSIC_LOOP_STEPS
    const context = this.context
    const step = this.musicStep % loopSteps
    const now = context.currentTime
    if (this.victoryMode) {
      this.playVictoryMusicStep(now, step)
    } else if (this.preferences.musicTrack === 'lantern') {
      this.playLanternMusicStep(now, step)
    } else if (this.preferences.musicTrack === 'paper') {
      this.playPaperBoatMusicStep(now, step)
    } else {
      this.playMeadowMusicStep(now, step)
    }

    this.musicStep = (this.musicStep + 1) % loopSteps
  }

  private playMeadowMusicStep(now: number, step: number): void {
    const phrase = Math.floor(step / MUSIC_PHRASE_STEPS)
    const stepInPhrase = step % MUSIC_PHRASE_STEPS
    const scale = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25]
    const chords = [
      { bass: 130.81, tones: [261.63, 329.63, 392], accent: 523.25 },
      { bass: 164.81, tones: [246.94, 329.63, 392], accent: 587.33 },
      { bass: 196, tones: [293.66, 392, 493.88], accent: 659.25 },
      { bass: 174.61, tones: [261.63, 349.23, 440], accent: 523.25 },
      { bass: 146.83, tones: [293.66, 349.23, 440], accent: 587.33 },
      { bass: 196, tones: [246.94, 293.66, 392], accent: 493.88 },
      { bass: 130.81, tones: [261.63, 329.63, 392], accent: 523.25 },
      { bass: 174.61, tones: [261.63, 349.23, 440], accent: 659.25 },
      { bass: 220, tones: [261.63, 329.63, 440], accent: 587.33 },
      { bass: 130.81, tones: [246.94, 329.63, 392], accent: 523.25 },
    ]
    const chord = chords[phrase % chords.length]
    const melody: Array<number | null> = [
      0, null, null, null, 2, null, null, null,
      3, null, null, null, null, null, null, null,
      4, null, null, null, 3, null, null, null,
      2, null, null, null, null, null, null, null,
      2, null, null, null, 3, null, null, null,
      5, null, null, null, null, null, null, null,
      4, null, null, null, 2, null, null, null,
      0, null, null, null, null, null, null, null,
      null, null, 0, null, null, null, 3, null,
      null, null, 4, null, null, null, null, null,
      5, null, null, null, 4, null, null, null,
      3, null, null, null, null, null, null, null,
      3, null, null, null, 5, null, null, null,
      6, null, null, null, null, null, null, null,
      5, null, null, null, 3, null, null, null,
      2, null, null, null, null, null, null, null,
    ]

    if (stepInPhrase === 0) {
      this.playMusicTone(now, chord.bass, 3.4, 0.014, 'sine')
      this.playMusicTone(now + 0.08, chord.tones[0], 2.9, 0.0085, 'triangle')
      this.playMusicTone(now + 0.16, chord.tones[1], 2.45, 0.0068, 'sine')
      if (phrase % 3 !== 1) {
        this.playMusicTone(now + 0.24, chord.tones[2], 2.2, 0.0052, 'triangle')
      }
    }

    if (stepInPhrase === 16) {
      this.playMusicTone(now, chord.tones[1], 2.15, 0.007, 'triangle')
      this.playMusicTone(now + 0.14, chord.tones[2], 1.85, 0.005, 'sine')
    }

    const note = melody[step % melody.length]
    if (note !== null) {
      const frequency = scale[note % scale.length]
      this.playMusicTone(now + 0.04, frequency, 1.7, 0.0095, 'triangle')
      if (stepInPhrase % 16 === 12) {
        this.playMusicTone(now + 0.08, frequency * 2, 0.8, 0.0022, 'sine')
      }
    }

    if (stepInPhrase === 24 && phrase % 2 === 0) {
      this.playMusicTone(now, chord.accent, 1.25, 0.0048, 'sine')
    }

    if (stepInPhrase === 28 && phrase === chords.length - 1) {
      this.playMusicTone(now, 523.25, 1.25, 0.0055, 'triangle')
    }
  }

  private playLanternMusicStep(now: number, step: number): void {
    const phrase = Math.floor(step / MUSIC_PHRASE_STEPS)
    const stepInPhrase = step % MUSIC_PHRASE_STEPS
    const chords = [
      { bass: 146.83, tones: [293.66, 349.23, 440], melody: [2, 4, 5, 4] },
      { bass: 196, tones: [293.66, 392, 493.88], melody: [3, 5, 6, 5] },
      { bass: 174.61, tones: [261.63, 349.23, 440], melody: [4, 3, 2, 0] },
      { bass: 130.81, tones: [261.63, 329.63, 392], melody: [0, 2, 3, 2] },
      { bass: 220, tones: [329.63, 440, 523.25], melody: [4, 5, 7, 5] },
      { bass: 196, tones: [293.66, 392, 493.88], melody: [6, 5, 3, 2] },
      { bass: 146.83, tones: [293.66, 349.23, 440], melody: [2, 4, 5, 7] },
      { bass: 174.61, tones: [261.63, 349.23, 440], melody: [5, 4, 2, 0] },
      { bass: 130.81, tones: [261.63, 329.63, 392], melody: [0, 3, 4, 3] },
      { bass: 196, tones: [246.94, 293.66, 392], melody: [2, 1, 0, 2] },
    ]
    const scale = [261.63, 293.66, 349.23, 392, 440, 493.88, 523.25, 587.33]
    const chord = chords[phrase % chords.length]

    if (stepInPhrase === 0) {
      this.playLanternGlow(now, chord.bass, 4.2, 0.011)
      this.playLanternGlow(now + 0.22, chord.tones[0], 3.1, 0.0058)
    }

    if (stepInPhrase === 8) {
      this.playLanternBell(now, chord.tones[1], 2.6, 0.0065)
    }

    if (stepInPhrase === 18) {
      this.playLanternGlow(now, chord.tones[2], 2.4, 0.0052)
    }

    if (stepInPhrase === 26 && phrase % 2 === 1) {
      this.playLanternBell(now, chord.tones[1] * 0.5, 2.2, 0.0048)
    }

    const melodySlots = [4, 12, 20, 28]
    const melodyIndex = melodySlots.indexOf(stepInPhrase)
    if (melodyIndex >= 0 && (phrase + melodyIndex) % 3 !== 1) {
      const noteIndex = chord.melody[melodyIndex] ?? 0
      this.playLanternBell(now + 0.03, scale[noteIndex % scale.length], 1.55, 0.007)
    }
  }

  private playPaperBoatMusicStep(now: number, step: number): void {
    const phrase = Math.floor(step / MUSIC_PHRASE_STEPS)
    const stepInPhrase = step % MUSIC_PHRASE_STEPS
    const chords = [
      { bass: 174.61, tones: [261.63, 349.23, 440], accent: 587.33 },
      { bass: 130.81, tones: [261.63, 329.63, 392], accent: 523.25 },
      { bass: 196, tones: [293.66, 392, 493.88], accent: 659.25 },
      { bass: 146.83, tones: [293.66, 349.23, 440], accent: 587.33 },
      { bass: 164.81, tones: [246.94, 329.63, 392], accent: 493.88 },
      { bass: 220, tones: [329.63, 440, 523.25], accent: 659.25 },
      { bass: 174.61, tones: [261.63, 349.23, 440], accent: 523.25 },
      { bass: 130.81, tones: [261.63, 329.63, 392], accent: 587.33 },
      { bass: 196, tones: [293.66, 392, 493.88], accent: 523.25 },
      { bass: 174.61, tones: [261.63, 329.63, 440], accent: 659.25 },
    ]
    const motif: Array<number | null> = [
      0, null, 2, null, null, 4, null, null,
      null, 5, null, null, 4, null, null, null,
      3, null, null, 2, null, null, 0, null,
      null, null, 2, null, null, null, null, null,
      2, null, 4, null, null, 5, null, null,
      null, 7, null, null, 5, null, null, null,
      4, null, null, 2, null, null, 3, null,
      null, null, 0, null, null, null, null, null,
    ]
    const scale = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25]
    const chord = chords[phrase % chords.length]

    if (stepInPhrase === 0) {
      this.playPaperPulse(now, chord.bass, 1.35, 0.0095)
      this.playPaperPluck(now + 0.09, chord.tones[0], 0.95, 0.006)
      this.playPaperPluck(now + 0.21, chord.tones[1], 0.9, 0.005)
    }

    if (stepInPhrase === 14 || stepInPhrase === 30) {
      this.playPaperPluck(now, chord.tones[2], 0.95, 0.0048)
    }

    const note = motif[step % motif.length]
    if (note !== null && (stepInPhrase < 24 || phrase % 2 === 0)) {
      this.playPaperPluck(now + 0.025, scale[note % scale.length], 0.78, 0.0064)
    }

    if (stepInPhrase === 24 && phrase % 3 === 2) {
      this.playPaperPluck(now, chord.accent, 0.82, 0.0045)
    }
  }

  private playVictoryMusicStep(now: number, step: number): void {
    const roots = [261.63, 329.63, 392, 349.23]
    const root = roots[Math.floor(step / 20) % roots.length]
    const melody: Array<number | null> = [
      0, null, null, 2, null, 4, null, null,
      7, null, null, 4, null, 2, null, null,
      4, null, 7, null, 9, null, null, null,
      7, null, 4, null, 2, null, null, null,
    ]
    const intervals = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2, 9 / 4, 5 / 2]

    if (step % 10 === 0) {
      this.playMusicTone(now, root / 2, 5.4, 0.025, 'sine')
      this.playMusicTone(now + 0.12, root * 1.25, 4.2, 0.012, 'triangle')
      this.playMusicTone(now + 0.22, root * 1.5, 3.8, 0.01, 'sine')
    }

    const note = melody[step % melody.length]
    if (note !== null) {
      const frequency = root * intervals[note % intervals.length]
      this.playMusicTone(now + 0.05, frequency, 1.9, 0.018, 'triangle')
      this.playMusicTone(now + 0.09, frequency * 2, 1.1, 0.0045, 'sine')
    }

    if (step % 40 === 32) {
      this.playMusicTone(now, root * 2, 1.2, 0.009, 'sine')
      this.playMusicTone(now + 0.16, root * 2.5, 1.1, 0.006, 'triangle')
    }
  }

  private duckMusic(durationMs: number): void {
    if (!this.context || !this.musicDuckGain) {
      return
    }

    const now = this.context.currentTime
    const recoverAt = now + durationMs / 1000
    this.musicDuckGain.gain.cancelScheduledValues(now)
    this.musicDuckGain.gain.setTargetAtTime(0.42, now, 0.03)
    this.musicDuckGain.gain.setTargetAtTime(1, recoverAt, 0.42)
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

  private playMusicTone(
    startTime: number,
    frequency: number,
    duration: number,
    volume: number,
    type: OscillatorType,
  ): void {
    const context = this.audioContext()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const filter = context.createBiquadFilter()

    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, startTime)
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(1150, startTime)
    const attackDuration = Math.min(0.18, duration * 0.4)
    gain.gain.setValueAtTime(0.0001, startTime)
    gain.gain.exponentialRampToValueAtTime(volume, startTime + attackDuration)
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)

    oscillator.connect(filter)
    filter.connect(gain)
    gain.connect(this.musicGain!)
    oscillator.start(startTime)
    oscillator.stop(startTime + duration + 0.08)
  }

  private playLanternGlow(startTime: number, frequency: number, duration: number, volume: number): void {
    this.playLayeredMusicTone(
      startTime,
      frequency,
      duration,
      volume,
      [
        { type: 'sine', ratio: 1, gain: 1 },
        { type: 'sine', ratio: 1.505, gain: 0.18 },
        { type: 'triangle', ratio: 2.01, gain: 0.09 },
      ],
      {
        attackDuration: Math.min(0.42, duration * 0.24),
        filterFrequency: 1850,
        filterQ: 0.65,
      },
    )
  }

  private playLanternBell(startTime: number, frequency: number, duration: number, volume: number): void {
    this.playLayeredMusicTone(
      startTime,
      frequency,
      duration,
      volume,
      [
        { type: 'sine', ratio: 1, gain: 1 },
        { type: 'sine', ratio: 2.01, gain: 0.34 },
        { type: 'triangle', ratio: 3.02, gain: 0.1 },
      ],
      {
        attackDuration: 0.035,
        filterFrequency: 2450,
        filterQ: 1.35,
      },
    )
  }

  private playPaperPulse(startTime: number, frequency: number, duration: number, volume: number): void {
    this.playLayeredMusicTone(
      startTime,
      frequency,
      duration,
      volume,
      [
        { type: 'triangle', ratio: 1, gain: 1 },
        { type: 'square', ratio: 1.995, gain: 0.08 },
        { type: 'sine', ratio: 0.5, gain: 0.16 },
      ],
      {
        attackDuration: 0.012,
        filterFrequency: 920,
        filterQ: 0.95,
      },
    )
  }

  private playPaperPluck(startTime: number, frequency: number, duration: number, volume: number): void {
    this.playLayeredMusicTone(
      startTime,
      frequency,
      duration,
      volume,
      [
        { type: 'triangle', ratio: 1, gain: 1 },
        { type: 'square', ratio: 2, gain: 0.075 },
      ],
      {
        attackDuration: 0.008,
        filterFrequency: 1350,
        filterQ: 1.05,
      },
    )
    this.playMusicNoise(startTime, 0.035, 3100, volume * 0.18)
  }

  private playLayeredMusicTone(
    startTime: number,
    frequency: number,
    duration: number,
    volume: number,
    layers: Array<{ type: OscillatorType; ratio: number; gain: number }>,
    options: { attackDuration: number; filterFrequency: number; filterQ: number },
  ): void {
    const context = this.audioContext()
    const filter = context.createBiquadFilter()
    const outputGain = context.createGain()

    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(options.filterFrequency, startTime)
    filter.Q.setValueAtTime(options.filterQ, startTime)
    outputGain.gain.setValueAtTime(0.0001, startTime)
    outputGain.gain.exponentialRampToValueAtTime(volume, startTime + options.attackDuration)
    outputGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)

    filter.connect(outputGain)
    outputGain.connect(this.musicGain!)

    layers.forEach((layer) => {
      const oscillator = context.createOscillator()
      const layerGain = context.createGain()

      oscillator.type = layer.type
      oscillator.frequency.setValueAtTime(frequency * layer.ratio, startTime)
      layerGain.gain.setValueAtTime(layer.gain, startTime)
      oscillator.connect(layerGain)
      layerGain.connect(filter)
      oscillator.start(startTime)
      oscillator.stop(startTime + duration + 0.08)
    })
  }

  private playMusicNoise(startTime: number, duration: number, cutoff: number, volume: number): void {
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
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(cutoff, startTime)
    filter.Q.setValueAtTime(1.8, startTime)
    gain.gain.setValueAtTime(volume, startTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)

    source.connect(filter)
    filter.connect(gain)
    gain.connect(this.musicGain!)
    source.start(startTime)
    source.stop(startTime + duration + 0.02)
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
