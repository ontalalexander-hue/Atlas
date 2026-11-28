// What the office's projectors show: your screen (shared from this browser), a video or picture file you pick, or a
// link (a YouTube video, or a web page). Screens and files stay in this browser: nothing is uploaded, and they end
// when you stop them or close the page. A link is remembered (this browser only) and comes back after a reload.
import { useOffice } from './store.js';

const media = {};   // projector id -> { kind, title, video?, image?, stream?, url? }

const bump = (id) => {
  const m = media[id];
  useOffice.getState().setProjector(id, m ? { kind: m.kind, title: m.title, n: Date.now() } : null);
};

export const projectorMedia = (id) => media[id] ?? null;

const SAVED = (id) => `atlas-office-projector-${id}`;

/**
 * Put a link on a projector: { kind: 'youtube', id, start, title, url } or { kind: 'page', url, title, frameable }
 * (GET /api/office/link). It plays in the player box (LinkPlayer); the 3D screen shows its title.
 */
export function openLink(id, link, { autoplay = true } = {}) {
  if (!link?.url || !/^https:\/\//.test(link.url)) throw new Error('Only https:// links can go on a projector.');
  // a link to this office itself would run inside the player with the office's own rights: never
  if (new URL(link.url).origin === location.origin) throw new Error("A link to Atlas itself can't go on a projector.");
  stopProjector(id);
  media[id] = { kind: 'link', title: String(link.title || link.url).slice(0, 120), link, autoplay };
  try { localStorage.setItem(SAVED(id), JSON.stringify(link)); } catch { /* not remembered */ }
  bump(id);
  useOffice.getState().setPlayer(id);
}

/** The link a projector showed before the page was reloaded, back on its screen (not playing until asked). */
export function restoreLink(id) {
  if (media[id]) return;
  try {
    const link = JSON.parse(localStorage.getItem(SAVED(id)) || 'null');
    if (!link?.url || !/^https:\/\//.test(link.url) || new URL(link.url).origin === location.origin) return;
    media[id] = { kind: 'link', title: String(link.title || link.url).slice(0, 120), link, autoplay: false };
    bump(id);
  } catch { /* nothing kept */ }
}

export function stopProjector(id) {
  const m = media[id];
  try { localStorage.removeItem(SAVED(id)); } catch { /* nothing kept */ }
  if (useOffice.getState().player === id) useOffice.getState().setPlayer(null);
  if (!m) return;
  try { m.stream?.getTracks().forEach((t) => t.stop()); } catch { /* already stopped */ }
  try { m.video?.pause(); } catch { /* nothing playing */ }
  if (m.url) URL.revokeObjectURL(m.url);
  delete media[id];
  bump(id);
}

/** Share a screen, a window or a browser tab (a tab playing a video works too) onto a projector. */
export async function shareScreen(id) {
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('This browser cannot share its screen.');
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  stopProjector(id);
  const video = document.createElement('video');
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  // stopping the share from the browser's own bar ends it here too
  stream.getVideoTracks()[0]?.addEventListener('ended', () => { if (media[id]?.stream === stream) stopProjector(id); });
  const label = stream.getVideoTracks()[0]?.label || '';
  media[id] = { kind: 'screen', title: label && !/^screen/i.test(label) ? label.slice(0, 60) : 'Your screen', video, stream };
  bump(id);
}

/** Play a video file, or show a picture, on a projector. */
export async function showFile(id, file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  stopProjector(id);
  if (file.type.startsWith('image/')) {
    const image = new Image();
    image.src = url;
    await image.decode().catch(() => {});
    media[id] = { kind: 'image', title: file.name.slice(0, 60), image, url };
  } else {
    const video = document.createElement('video');
    video.src = url;
    video.playsInline = true;
    video.loop = false;
    await video.play();
    media[id] = { kind: 'video', title: file.name.slice(0, 60), video, url };
  }
  bump(id);
}

export function togglePause(id) {
  const v = media[id]?.video;
  if (!v || media[id].kind !== 'video') return;
  if (v.paused) v.play().catch(() => {}); else v.pause();
  bump(id);
}
