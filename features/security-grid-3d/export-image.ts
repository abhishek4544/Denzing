export function exportSecurityGridScene(canvas: HTMLCanvasElement) {
  const url = canvas.toDataURL("image/png");
  const link = document.createElement("a");
  link.href = url;
  link.download = "security-grid-3d.png";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
