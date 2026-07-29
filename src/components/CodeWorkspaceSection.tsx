import React from 'react';
import { motion } from 'motion/react';
import { CodeWorkspace } from './CodeWorkspace';

interface CodeWorkspaceSectionProps {
  onClose: () => void;
  onGenerateCodeRequest: (prompt: string) => void;
  onStartLiveVoice: () => void;
  apiKeys: any;
  isGenerating: boolean;
}

export const CodeWorkspaceSection: React.FC<CodeWorkspaceSectionProps> = ({
  onClose,
  onGenerateCodeRequest,
  onStartLiveVoice,
  apiKeys,
  isGenerating,
}) => {
  return (
    <motion.div 
      key="workspace-code"
      initial={{ opacity: 0, scale: 0.995 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.995 }}
      transition={{ duration: 0.2 }}
      className="w-full flex-1 flex flex-col min-h-0 overflow-hidden"
    >
      <CodeWorkspace 
        onClose={onClose}
        onGenerateCodeRequest={onGenerateCodeRequest}
        onStartLiveVoice={onStartLiveVoice}
        apiKeys={apiKeys}
        isGenerating={isGenerating}
      />
    </motion.div>
  );
};
