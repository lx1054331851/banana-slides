export interface SettingsSectionBounds {
  id: string;
  top: number;
  bottom: number;
}

const DEFAULT_VIEWPORT_ANCHOR_RATIO = 0.25;

// Returns the settings section that contains the viewport anchor line.
export const getActiveSettingsSectionId = (
  sections: SettingsSectionBounds[],
  viewportHeight: number,
  anchorRatio = DEFAULT_VIEWPORT_ANCHOR_RATIO,
) => {
  if (sections.length === 0) return null;

  const anchorY = viewportHeight * anchorRatio;
  const containingSection = sections.find((section) => (
    section.top <= anchorY && section.bottom > anchorY
  ));
  if (containingSection) return containingSection.id;

  const visibleSections = sections.filter((section) => section.bottom > 0 && section.top < viewportHeight);
  if (visibleSections.length > 0) {
    return visibleSections
      .slice()
      .sort((a, b) => Math.abs(a.top - anchorY) - Math.abs(b.top - anchorY))[0].id;
  }

  return sections
    .slice()
    .sort((a, b) => Math.abs(a.top - anchorY) - Math.abs(b.top - anchorY))[0].id;
};
