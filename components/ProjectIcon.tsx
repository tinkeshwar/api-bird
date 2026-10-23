const HUES = ["indigo", "cyan", "green", "amber", "violet", "orange"];
// Stable hue per name so a project keeps its colour wherever it shows up.
export const hueOf = (name: string) => `var(--c-${HUES[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % HUES.length]})`;

export function ProjectIcon({ icon, name, size = 32, hue = hueOf(name) }: { icon?: string; name: string; size?: number; hue?: string }) {
  if (icon) {
    // eslint-disable-next-line @next/next/no-img-element -- data URL, nothing for next/image to optimise
    return <img src={icon} alt="" width={size} height={size} className="rounded-xl object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-xl font-bold text-white transition-transform group-hover:-rotate-3 group-hover:scale-105"
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${hue}, color-mix(in srgb, ${hue} 55%, #000))`, boxShadow: `0 6px 18px -6px ${hue}` }}
    >
      {name[0]?.toUpperCase()}
    </span>
  );
}
