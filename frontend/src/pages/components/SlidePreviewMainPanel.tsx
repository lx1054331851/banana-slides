import React from 'react';

type SlidePreviewMainPanelProps = {
  children: React.ReactNode;
};

export const SlidePreviewMainPanel: React.FC<SlidePreviewMainPanelProps> = ({ children }) => {
  return (
    <main className="flex-1 flex flex-col bg-white dark:bg-background-primary min-w-0 overflow-hidden">
      {children}
    </main>
  );
};
