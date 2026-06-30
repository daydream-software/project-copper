// Audio: looping background music (the two suno tracks) + tiny synthesized SFX. The
// only module besides the renderer that produces output; the pure sim stays silent.
// Browsers block sound until a user gesture, so call resumeAudio() on the first one.

import betweenUrl from './audio/between-runs.ogg'
import autorunUrl from './audio/autorun.mp3'

export type MusicTrack = 'autorun' | 'between' | 'off'

const URLS: Record<'autorun' | 'between', string> = { between: betweenUrl, autorun: autorunUrl }

let music: HTMLAudioElement | null = null
let loaded: MusicTrack = 'off'

function musicEl(): HTMLAudioElement {
  if (music === null) {
    music = new Audio()
    music.loop = true
    music.volume = 0.5
  }
  return music
}

/** Pick the music track (or 'off'). Starts on a user gesture; ignores autoplay blocks. */
export function setMusic(track: MusicTrack): void {
  if (track === 'off') {
    music?.pause()
    return
  }
  const el = musicEl()
  if (track !== loaded) {
    el.src = URLS[track]
    loaded = track
  }
  el.play().catch(() => {
    /* autoplay blocked until the user interacts — a panel click counts */
  })
}

// --- SFX: a lazily-created WebAudio context + a couple of one-shot synth sounds ---
let ctx: AudioContext | null = null
let sfxOn = true

export function setSfx(on: boolean): void {
  sfxOn = on
}

/** Resume audio on the first user gesture (browsers start the context suspended). */
export function resumeAudio(): void {
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
}

function sfxCtx(): AudioContext | null {
  if (!sfxOn) return null
  ctx ??= new AudioContext()
  return ctx
}

/** Gather pulse: a soft downward blip (a tug inward). */
export function sfxPulse(): void {
  const c = sfxCtx()
  if (c === null) return
  const t = c.currentTime
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(440, t)
  osc.frequency.exponentialRampToValueAtTime(150, t + 0.16)
  gain.gain.setValueAtTime(0.16, t)
  gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.19)
  osc.connect(gain)
  gain.connect(c.destination)
  osc.start(t)
  osc.stop(t + 0.2)
}

/** Shatter: a short filtered noise crack. */
export function sfxShatter(): void {
  const c = sfxCtx()
  if (c === null) return
  const t = c.currentTime
  const len = Math.floor(c.sampleRate * 0.18)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / len) // white noise, decaying
  }
  const src = c.createBufferSource()
  src.buffer = buf
  const hp = c.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 700
  const gain = c.createGain()
  gain.gain.value = 0.22
  src.connect(hp)
  hp.connect(gain)
  gain.connect(c.destination)
  src.start(t)
}
