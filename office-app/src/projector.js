// What the office's projectors show: your screen (shared from this browser), or a video or picture file you pick.
// It all stays in this browser: nothing is uploaded, and it ends when you stop it or close the page.
import { useOffice } from './store.js';

const media = {};   // projector id -> { kind, title, video?, image?, stream?, url? }

const bump = (id) => {
  const m = media[id];
  useOffice.getState().setProjector(id, m ? { kind: m.kind, title: m.title, n: Date.now() } : null);
};

export const projectorMedia = (id) => media[id] ?? null;

export function stopProjector(id) {
  const m = media[id];
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
