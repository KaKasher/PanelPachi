import { type FC } from 'react';

interface ToolbarProps {
  currentTool: string;
  onToolChange: (tool: string) => void;
  onExportMask?: () => void;
  onUndo?: () => void;
  isInpainting?: boolean;
}

const Toolbar: FC<ToolbarProps> = ({ 
  currentTool, 
  onToolChange, 
  onExportMask, 
  onUndo, 
  isInpainting = false 
}) => {
  return (
    <div className="flex items-center gap-4 p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
      <span className="text-sm font-medium text-gray-700">Tools:</span>
      
      {/* Mask Tool Button */}
      <button
        className={`
          btn btn-sm 
          ${currentTool === 'mask' ? 'btn-primary' : 'btn-outline'}
          flex items-center gap-1.5
        `}
        onClick={() => onToolChange('mask')}
        disabled={isInpainting}
        title="Mask Drawing Tool - Scroll to adjust brush size"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4 2a2 2 0 00-2 2v11a3 3 0 106 0V4a2 2 0 00-2-2H4zm1 14a1 1 0 100-2 1 1 0 000 2zm5-1.757l4.9-4.9a2 2 0 000-2.828L13.485 5.1a2 2 0 00-2.828 0L10 5.757v8.486zM16 18H9.071l6-6H16a2 2 0 012 2v2a2 2 0 01-2 2z" clipRule="evenodd" />
        </svg>
        <span>Mask</span>
      </button>
      
      {/* Inpaint Button */}
      <button
        className={`
          btn btn-sm btn-primary
          flex items-center gap-1.5
          ${isInpainting ? 'opacity-75 cursor-not-allowed' : ''}
        `}
        onClick={onExportMask}
        disabled={!onExportMask || isInpainting}
        title="Inpaint the masked areas"
      >
        {isInpainting ? (
          <>
            <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Processing...</span>
          </>
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
            </svg>
            <span>Inpaint</span>
          </>
        )}
      </button>
      
      {/* Undo Button */}
      <button
        className="btn btn-sm btn-outline flex items-center gap-1.5"
        onClick={onUndo}
        disabled={!onUndo || isInpainting}
        title="Undo last action"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
        </svg>
        <span>Undo</span>
      </button>
      
      {/* Tips on the right */}
      <div className="ml-auto text-xs px-3 py-1.5 bg-gray-50 text-gray-500 rounded border border-gray-200">
        <span className="text-primary-600 font-semibold">Tip:</span> Scroll to adjust brush • Ctrl+Scroll to zoom • Ctrl+0 to reset • Space+drag to pan
      </div>
    </div>
  );
};

export default Toolbar; 