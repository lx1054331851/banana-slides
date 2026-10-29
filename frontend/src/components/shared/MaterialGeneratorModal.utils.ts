/** Compute the visible image bounds for region selection. */
export function getRenderedImageRect(img: HTMLImageElement) {
  const naturalWidth = img.naturalWidth || 1;
  const naturalHeight = img.naturalHeight || 1;
  const scale = Math.min(img.clientWidth / naturalWidth, img.clientHeight / naturalHeight);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  const left = (img.clientWidth - width) / 2;
  const top = (img.clientHeight - height) / 2;
  return { left, top, width, height, naturalWidth, naturalHeight };
}

