/** OrbitControls at the preview's nominal 60 FPS takes 1200 / speed seconds per turn. */
export function getVideoTiming(
  settings: { autoRotate: boolean; rotateSpeed: number },
  options: { loop: boolean; duration: number; fps: number },
) {
  const speed = settings.autoRotate && Number.isFinite(settings.rotateSpeed) ? settings.rotateSpeed : 0;
  const automatic = options.loop && speed !== 0;
  // Round up to a whole frame so closing the loop can never accelerate rotation.
  const frames = automatic
    ? Math.ceil(1200 / Math.abs(speed) * options.fps)
    : Math.round(options.duration * options.fps);
  return {
    automatic,
    frames,
    duration: frames / options.fps,
    rotationPerFrame: automatic
      ? -Math.sign(speed) * Math.PI * 2 / frames
      : -Math.PI * 2 * speed / (1200 * options.fps),
  };
}
