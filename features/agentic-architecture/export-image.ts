export function exportArchitectureScene(svg: SVGSVGElement, backgroundColor: string) {
  const vb = svg.viewBox.baseVal;
  const w = vb && vb.width ? vb.width : svg.clientWidth || 1200;
  const h = vb && vb.height ? vb.height : svg.clientHeight || 1800;

  const clone = svg.cloneNode(true) as SVGSVGElement;
  if (!clone.getAttribute("xmlns")) clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const xml = new XMLSerializer().serializeToString(clone);
  const svg64 = window.btoa(unescape(encodeURIComponent(xml)));
  const src = `data:image/svg+xml;base64,${svg64}`;

  const img = new Image();
  img.onload = () => {
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(w * scale);
    canvas.height = Math.floor(h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = url;
    link.download = "agentic-architecture.png";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };
  img.src = src;
}
