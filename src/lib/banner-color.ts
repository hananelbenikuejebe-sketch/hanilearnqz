// Deterministic, pleasant gradient banners for quizzes without an uploaded image.
// Hash the seed (quiz id/title) to pick from a curated hue palette so the
// generated colour is stable across renders and never garish.

const HUES = [210, 265, 190, 330, 25, 155, 285, 10, 200, 45];

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Deterministic HSL string to persist on the quiz row (banner_color). */
export function pickBannerColor(seed: string): string {
  const h = hashSeed(seed || "quiz");
  const hue = HUES[h % HUES.length];
  return `hsl(${hue} 70% 45%)`;
}

/** Returns a style object + class string for rendering a banner without an image. */
export function quizBannerStyle(seed: string, stored?: string | null): { style: React.CSSProperties; className: string } {
  const h = hashSeed(seed || "quiz");
  const hue = HUES[h % HUES.length];
  const hue2 = HUES[(h >> 3) % HUES.length];
  const base = stored && stored.trim() ? stored : `hsl(${hue} 70% 45%)`;
  const accent = `hsl(${hue2} 75% 55%)`;
  return {
    style: {
      backgroundImage: `linear-gradient(135deg, ${base}, ${accent})`,
    },
    className: "text-primary-foreground",
  };
}
