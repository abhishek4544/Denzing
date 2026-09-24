export function exportStrataScene(canvas: HTMLCanvasElement) {
  const url = canvas.toDataURL("image/png");
  const link = document.createElement("a");
  link.href = url;
  link.download = "mesh-strata-3d-lab.png";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
