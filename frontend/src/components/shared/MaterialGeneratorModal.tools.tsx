import React from 'react';
import { Crop, Eraser, Sparkles, Wand2 } from 'lucide-react';
import type { MaterialProcessOperation } from '@/api/endpoints';

type ToolCard = {
  value: MaterialProcessOperation;
  icon: React.ReactNode;
  labelKey: string;
  descKey: string;
};

export const TOOL_CARDS: ToolCard[] = [
  { value: 'generate', icon: <Sparkles size={16} />, labelKey: 'material.toolGenerate', descKey: 'material.toolGenerateDesc' },
  { value: 'edit_full', icon: <Wand2 size={16} />, labelKey: 'material.toolEditFull', descKey: 'material.toolEditFullDesc' },
  { value: 'region_edit', icon: <Crop size={16} />, labelKey: 'material.toolRegionEdit', descKey: 'material.toolRegionEditDesc' },
  { value: 'erase_region', icon: <Eraser size={16} />, labelKey: 'material.toolEraseRegion', descKey: 'material.toolEraseRegionDesc' },
];

