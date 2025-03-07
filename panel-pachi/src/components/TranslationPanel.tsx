import { FC, useState } from 'react';

export interface Translation {
  id: string;
  original: string;
  translated: string;
  bounds: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

interface TranslationPanelProps {
  translations: Translation[];
  onAddTextToCanvas: (translation: Translation) => void;
  onSelectionHover?: (id: string | null) => void;
  onClose: () => void;
}

const TranslationPanel: FC<TranslationPanelProps> = ({
  translations,
  onAddTextToCanvas,
  onSelectionHover,
  onClose
}) => {
  const [editingTranslation, setEditingTranslation] = useState<{ id: string, text: string } | null>(null);

  // Handle editing a translation
  const handleEditTranslation = (id: string, initialText: string) => {
    setEditingTranslation({ id, text: initialText });
  };

  // Handle saving an edited translation
  const handleSaveEdit = (id: string) => {
    if (!editingTranslation) return;
    
    // Find the translation to update
    const updatedTranslation = translations.find(t => t.id === id);
    if (updatedTranslation) {
      // Call onAddTextToCanvas with the updated translation
      onAddTextToCanvas({
        ...updatedTranslation,
        translated: editingTranslation.text
      });
    }
    
    // Exit edit mode
    setEditingTranslation(null);
  };

  if (translations.length === 0) {
    return (
      <div className="w-80 p-4 bg-white border-l border-gray-200 h-full flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Translations</h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
          Select areas on the image and click "Translate Selected" to see translations here.
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 p-4 bg-white border-l border-gray-200 h-full flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Translations</h2>
        <button 
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pr-2">
        {translations.map((translation) => (
          <div 
            key={translation.id}
            className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200 shadow-sm"
            onMouseEnter={() => onSelectionHover && onSelectionHover(translation.id)}
            onMouseLeave={() => onSelectionHover && onSelectionHover(null)}
          >
            <div className="text-xs font-medium text-gray-500 mb-1">
              Selection #{translation.id}
            </div>
            
            <div className="mb-2">
              <div className="text-xs text-gray-500 mb-1">Original:</div>
              <div className="p-2 bg-white border border-gray-200 rounded text-sm">
                {translation.original}
              </div>
            </div>
            
            <div className="mb-3">
              <div className="text-xs text-gray-500 mb-1">Translation:</div>
              {editingTranslation && editingTranslation.id === translation.id ? (
                <div>
                  <textarea 
                    className="w-full p-2 border border-primary-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                    value={editingTranslation.text}
                    onChange={(e) => setEditingTranslation({ ...editingTranslation, text: e.target.value })}
                    rows={3}
                    autoFocus
                  />
                  <div className="flex justify-end mt-2 gap-2">
                    <button 
                      className="text-gray-500 text-xs hover:text-gray-700"
                      onClick={() => setEditingTranslation(null)}
                    >
                      Cancel
                    </button>
                    <button 
                      className="bg-primary-500 text-white text-xs px-2 py-1 rounded hover:bg-primary-600"
                      onClick={() => handleSaveEdit(translation.id)}
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-2 bg-white border border-gray-200 rounded text-sm">
                  {translation.translated}
                </div>
              )}
            </div>
            
            <div className="flex justify-end gap-2">
              <button 
                className="text-gray-600 text-xs hover:text-gray-800 flex items-center gap-1"
                onClick={() => handleEditTranslation(translation.id, translation.translated)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                </svg>
                Edit
              </button>
              
              <button 
                className="bg-primary-500 text-white text-xs px-2 py-1 rounded hover:bg-primary-600 flex items-center gap-1"
                onClick={() => onAddTextToCanvas(translation)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                Add to Image
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TranslationPanel; 