// Audio: looping background music (the two suno tracks) + tiny synthesized SFX. The
// only module besides the renderer that produces output; the pure sim stays silent.
// Browsers block sound until a user gesture, so call resumeAudio() on the first one.

import betweenUrl from './audio/between-runs.ogg'
import autorunUrl from './audio/autorun.mp3'

export type MusicTrack = 'autorun' | 'between' | 'off'

const URLS: Record<'autorun' | 'between', string> = { between: betweenUrl, autorun: autorunUrl }

let music: HTMLAudioElement | null = null
let loaded: MusicTrack = 'off'
let musicVolume = 0.5

function musicEl(): HTMLAudioElement {
  if (music === null) {
    music = new Audio()
    music.loop = true
  }
  music.volume = musicVolume
  return music
}

/** Music loudness, 0–1. Applies live to the playing track. */
export function setMusicVolume(v: number): void {
  musicVolume = v
  if (music !== null) music.volume = v
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

// --- SFX: a lazily-created WebAudio context + a couple of one-shot synth sounds, all
// routed through a master gain so one volume controls them (0 = muted) ---
let ctx: AudioContext | null = null
let sfxGain: GainNode | null = null
let sfxVolume = 0.8

/** SFX loudness, 0–1 (0 mutes them). Applies live. */
export function setSfxVolume(v: number): void {
  sfxVolume = v
  if (sfxGain !== null) sfxGain.gain.value = v
}

/** Resume audio on the first user gesture (browsers start the context suspended). */
export function resumeAudio(): void {
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
}

// The SFX context + the master gain node everything connects to — or null when muted.
function sfxOut(): { c: AudioContext, out: AudioNode } | null {
  if (sfxVolume <= 0) return null
  ctx ??= new AudioContext()
  if (sfxGain === null) {
    sfxGain = ctx.createGain()
    sfxGain.gain.value = sfxVolume
    sfxGain.connect(ctx.destination)
  }
  return { c: ctx, out: sfxGain }
}

/** Gather pulse: a soft downward blip (a tug inward). */
export function sfxPulse(): void {
  const s = sfxOut()
  if (s === null) return
  const { c, out } = s
  const t = c.currentTime
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(380 + Math.random() * 140, t) // 380–520 Hz: a little tug-pitch variation
  osc.frequency.exponentialRampToValueAtTime(140 + Math.random() * 40, t + 0.16)
  gain.gain.setValueAtTime(0.16, t)
  gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.19)
  osc.connect(gain)
  gain.connect(out)
  osc.start(t)
  osc.stop(t + 0.2)
}

/** Shatter: a short filtered noise crack. Every parameter is jittered per call so a popcorn
 * cascade of shatters is a spread of distinct pops, not one sound on repeat. */
export function sfxShatter(): void {
  const s = sfxOut()
  if (s === null) return
  const { c, out } = s
  const t = c.currentTime
  const len = Math.floor(c.sampleRate * (0.12 + Math.random() * 0.1)) // snap length, 0.12–0.22s
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / len) // white noise, decaying
  }
  const src = c.createBufferSource()
  src.buffer = buf
  const hp = c.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 500 + Math.random() * 600 // 500–1100 Hz: darker ↔ brighter pop
  hp.Q.value = 0.7 + Math.random() * 1.6 // a little resonance → a faint, varied pop pitch
  const gain = c.createGain()
  gain.gain.value = 0.16 + Math.random() * 0.1
  src.connect(hp)
  hp.connect(gain)
  gain.connect(out)
  src.start(t)
}
