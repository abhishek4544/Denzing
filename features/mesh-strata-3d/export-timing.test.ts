import assert from "node:assert/strict";
import { test } from "node:test";
import { getVideoTiming } from "./export-timing";

test("loop duration follows rotation speed instead of the manual duration", () => {
  for (const fps of [24, 30, 60]) {
    for (const speed of [1, 21, 60, 100, -21]) {
      const timing = getVideoTiming({ autoRotate: true, rotateSpeed: speed }, { loop: true, duration: 10, fps });
      const naturalDuration = 1200 / Math.abs(speed);
      assert.equal(timing.automatic, true);
      assert.ok(timing.duration >= naturalDuration);
      assert.ok(timing.duration - naturalDuration < 1 / fps);
      assert.equal(timing.duration * fps, timing.frames);
      assert.ok(Math.abs(timing.rotationPerFrame * timing.frames + Math.sign(speed) * Math.PI * 2) < 1e-12);
    }
  }
});

test("slow loops can exceed the manual 30 second limit", () => {
  const timing = getVideoTiming({ autoRotate: true, rotateSpeed: 1 }, { loop: true, duration: 10, fps: 30 });
  assert.equal(timing.duration, 1200);
  assert.equal(timing.frames, 36000);
});

test("the wrap from the last frame to the first is exactly one rotation step", () => {
  const timing = getVideoTiming({ autoRotate: true, rotateSpeed: 21 }, { loop: true, duration: 10, fps: 30 });
  const lastAngle = timing.rotationPerFrame * (timing.frames - 1);
  const nextAngle = timing.rotationPerFrame * timing.frames;
  assert.ok(Math.abs(nextAngle + 2 * Math.PI) < 1e-12);
  assert.ok(Math.abs(nextAngle - lastAngle - timing.rotationPerFrame) < 1e-12);
  assert.equal(timing.frames, 1715);
});

test("manual export retains its duration and the selected rotation speed", () => {
  for (const fps of [24, 30, 60]) {
    const timing = getVideoTiming({ autoRotate: true, rotateSpeed: 21 }, { loop: false, duration: 10, fps });
    assert.equal(timing.automatic, false);
    assert.equal(timing.duration, 10);
    assert.equal(timing.frames, 10 * fps);
    assert.ok(Math.abs(timing.rotationPerFrame * fps + 2 * Math.PI * 21 / 1200) < 1e-12);
  }
});

test("disabled rotation and zero speed use the manual duration without moving", () => {
  for (const settings of [{ autoRotate: false, rotateSpeed: 21 }, { autoRotate: true, rotateSpeed: 0 }]) {
    const timing = getVideoTiming(settings, { loop: true, duration: 10, fps: 30 });
    assert.equal(timing.automatic, false);
    assert.equal(timing.duration, 10);
    assert.equal(timing.frames, 300);
    assert.ok(timing.rotationPerFrame === 0);
  }
});
