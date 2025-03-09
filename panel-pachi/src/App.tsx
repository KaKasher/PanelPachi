import { useState, useEffect, useRef } from 'react';
import ImageUploader from './components/ImageUploader';
import CanvasEditor from './components/CanvasEditor';
import Toolbar from './components/Toolbar';
import TranslationPanel from './components/TranslationPanel';
import type { CanvasEditorRef } from './components/CanvasEditor';
import type { Translation } from './components/TranslationPanel';

// Get API URL from environment variables
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function App() {
  const [uploadedImage, setUploadedImage] = useState<File | null>(null);
  const [currentTool, setCurrentTool] = useState<string>('pointer');
  const [snackbarOpen, setSnackbarOpen] = useState<boolean>(false);
  const [snackbarMessage, setSnackbarMessage] = useState<string>('');
  const [isInpainting, setIsInpainting] = useState<boolean>(false);
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [alertType, setAlertType] = useState<'success' | 'error'>('success');
  const [apiConnected, setApiConnected] = useState<boolean | null>(null);
  const [hasSelections, setHasSelections] = useState<boolean>(false);
  const [showTranslationsPanel, setShowTranslationsPanel] = useState<boolean>(false);
  const [translations, setTranslations] = useState<Translation[]>([]);
  
  // Create a ref for the CanvasEditor component
  const canvasEditorRef = useRef<CanvasEditorRef>(null);

  // Check API connectivity on mount
  useEffect(() => {
    const checkApiConnectivity = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(`${API_URL}/health`, {
          signal: controller.signal
        }).catch(() => null);
        
        clearTimeout(timeoutId);
        const isConnected = !!response && response.ok;
        setApiConnected(isConnected);
        
        if (!isConnected) {
          setSnackbarMessage("Warning: Cannot connect to the backend API. You can still edit images, but inpainting will not work. Make sure the API server is running.");
          setAlertType('error');
          setSnackbarOpen(true);
        }
      } catch (error) {
        setApiConnected(false);
        setSnackbarMessage("Warning: Cannot connect to the backend API. You can still edit images, but inpainting will not work. Make sure the API server is running.");
        setAlertType('error');
        setSnackbarOpen(true);
      }
    };
    
    checkApiConnectivity();
    
    // Retry connecting to API every 30 seconds
    const intervalId = setInterval(checkApiConnectivity, 30000);
    
    return () => clearInterval(intervalId);
  }, []);

  // Ensure the app takes up the full viewport and prevents scrolling
  useEffect(() => {
    // Set height to 100vh to ensure it takes up the full viewport height
    document.documentElement.style.height = '100vh';
    document.body.style.height = '100vh';
    document.body.style.margin = '0';
    document.body.style.overflow = 'hidden';
    
    const resizeHandler = () => {
      // Update viewport height for mobile browsers
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    
    window.addEventListener('resize', resizeHandler);
    // Initial call
    resizeHandler();
    
    return () => {
      window.removeEventListener('resize', resizeHandler);
      document.documentElement.style.height = '';
      document.body.style.height = '';
      document.body.style.margin = '';
      document.body.style.overflow = '';
    };
  }, []);

  const handleImageUpload = (file: File) => {
    setUploadedImage(file);
  };

  const handleReset = () => {
    setUploadedImage(null);
    setTranslations([]);
    setShowTranslationsPanel(false);
  };
  
  // Handle export mask functionality
  const handleExportMask = () => {
    if (!apiConnected) {
      setSnackbarMessage("Cannot inpaint: The backend API is not connected. Please start the API server and try again.");
      setAlertType('error');
      setSnackbarOpen(true);
      return;
    }
    
    if (canvasEditorRef.current && typeof canvasEditorRef.current.exportMask === 'function') {
      setIsInpainting(true);
      canvasEditorRef.current.exportMask()
        .then(() => {
          setSnackbarMessage("Inpainting completed successfully!");
          setAlertType('success');
          setSnackbarOpen(true);
          setIsInpainting(false);
        })
        .catch((error: any) => {
          setSnackbarMessage(`Inpainting failed: ${error.message || 'Unknown error'}`);
          setAlertType('error');
          setSnackbarOpen(true);
          setIsInpainting(false);
        });
    }
  };
  
  // Handle undo functionality
  const handleUndo = () => {
    if (canvasEditorRef.current && typeof canvasEditorRef.current.undo === 'function') {
      canvasEditorRef.current.undo();
    }
  };
  
  // Handle translate selected functionality
  const handleTranslateSelected = async () => {
    if (!apiConnected || !canvasEditorRef.current) {
      setSnackbarMessage("Cannot translate: The backend API is not connected. Please start the API server and try again.");
      setAlertType('error');
      setSnackbarOpen(true);
      return;
    }

    // Get the current selections from the canvas
    const selections = canvasEditorRef.current.getSelections();
    
    if (selections.length === 0) {
      setSnackbarMessage("No text areas selected. Please use the selection tool to mark text areas first.");
      setAlertType('error');
      setSnackbarOpen(true);
      return;
    }
    
    setIsTranslating(true);
    
    try {
      // Prepare image data from canvas
      const imageBlob = await getCanvasImageBlob();
      if (!imageBlob) throw new Error("Failed to get image from canvas");
      
      // Store selection bounds for later use (they're already transformed to original image coordinates)
      const selectionsBoundsMap = selections.reduce((map, selection) => {
        map[selection.id] = {
          left: selection.left,
          top: selection.top,
          width: selection.width,
          height: selection.height
        };
        return map;
      }, {} as Record<string, {left: number, top: number, width: number, height: number}>);
      
      // Create form data with the image and selections
      const formData = new FormData();
      formData.append('image', imageBlob, 'image.png');
      formData.append('selections', JSON.stringify(selections));
      
      // Send to OCR endpoint
      const ocrResponse = await fetch(`${API_URL}/ocr`, {
        method: 'POST',
        body: formData
      });
      
      if (!ocrResponse.ok) throw new Error("OCR processing failed");
      
      const ocrData = await ocrResponse.json();
      
      // Prepare data for translation
      const textsToTranslate = ocrData.map((item: {id: string, text: string}) => ({
        id: item.id,
        text: item.text
      }));
      
      // Send to translation endpoint
      const translationResponse = await fetch(`${API_URL}/translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(textsToTranslate)
      });
      
      if (!translationResponse.ok) throw new Error("Translation failed");
      
      const translationData = await translationResponse.json();
      
      // Process and update the UI with translations
      const translationsWithBounds = translationData.map((item: {id: string, original: string, translated: string}) => {
        const bounds = selectionsBoundsMap[item.id] || {
          left: 0,
          top: 0,
          width: 100,
          height: 50
        };
        
        return {
          id: item.id,
          original: item.original,
          translated: item.translated,
          bounds
        };
      });
      
      // Update state with translations
      setTranslations(translationsWithBounds);
      setShowTranslationsPanel(true);
      
      // After setting state to show panel, update text positions
      setTimeout(() => {
        canvasEditorRef.current?.updateTextPositions?.();
      }, 100); // Small delay to allow layout to update
      
      setSnackbarMessage("Translation completed successfully!");
      setAlertType('success');
      setSnackbarOpen(true);
    } catch (error: any) {
      setSnackbarMessage(`Translation failed: ${error.message || 'Unknown error'}`);
      setAlertType('error');
      setSnackbarOpen(true);
    } finally {
      setIsTranslating(false);
    }
  };
  
  // Helper function to get image blob from canvas
  const getCanvasImageBlob = (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!uploadedImage) {
        resolve(null);
        return;
      }
      
      // Use FileReader to get the image data
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          // Create an image element
          const img = new Image();
          img.onload = () => {
            // Create a canvas to get the image data
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0);
            
            // Get the image as a blob
            canvas.toBlob((blob) => {
              resolve(blob);
            }, 'image/png');
          };
          img.src = event.target.result as string;
        } else {
          resolve(null);
        }
      };
      reader.readAsDataURL(uploadedImage);
    });
  };
  
  // Handle selection hover
  const handleSelectionHover = (id: string | null) => {
    if (canvasEditorRef.current) {
      canvasEditorRef.current.highlightSelection(id);
    }
  };
  
  // Handle adding text to canvas
  const handleAddTextToCanvas = (translation: Translation) => {
    if (canvasEditorRef.current) {
      canvasEditorRef.current.addTextToCanvas({
        ...translation,
        // Set default styling
        textStyle: {
          fontFamily: 'SF Toontime',
          fontSize: 18,
          color: '#000000'
        }
      });
      
      // Set tool to 'pointer' to allow interacting with the text without drawing selections
      setCurrentTool('pointer');
    }
  };
  
  // Update current tool to show or hide text options
  const handleToolChange = (tool: string) => {
    setCurrentTool(tool);
  };
  
  // Handle closing the translations panel
  const handleCloseTranslationsPanel = () => {
    setShowTranslationsPanel(false);
    
    // Update text positions after panel closes
    // This is necessary because the layout changes can affect positioning
    setTimeout(() => {
      canvasEditorRef.current?.updateTextPositions?.();
    }, 100); // Small delay to allow layout to update
  };
  
  const handleSnackbarClose = () => {
    setSnackbarOpen(false);
  };

  // Update handleTextSelection to remove text options
  const handleTextSelection = (isTextSelected: boolean) => {
    // We've removed text styling options, so this function is simplified
    // It may still be needed for other functionality, so we're keeping it minimal
  };

  return (
    <div className="h-screen max-h-screen flex flex-col text-gray-800 overflow-hidden">
      <header className="py-2 px-4 border-b border-gray-100 shadow-sm bg-white">
        <h1 className="text-2xl font-semibold text-center text-gray-800">
          <span className="text-primary-500">Panel</span>Pachi - Manga SFX Editor
        </h1>
      </header>
      
      <main className="flex-1 flex flex-col overflow-hidden max-w-[1800px] mx-auto w-full p-4">
        {uploadedImage ? (
          <>
            <div className="flex justify-between items-center mb-4">
              <Toolbar 
                currentTool={currentTool} 
                onToolChange={handleToolChange}
                onExportMask={apiConnected ? handleExportMask : undefined}
                onUndo={handleUndo}
                onTranslateSelected={apiConnected ? handleTranslateSelected : undefined}
                isInpainting={isInpainting}
                isTranslating={isTranslating}
                hasSelections={hasSelections}
              />
              
              <div className="flex items-center">
                <div className="text-xs text-gray-500 mr-3">
                  {uploadedImage.name} ({Math.round(uploadedImage.size / 1024)} KB)
                </div>
                
                <button
                  className="btn btn-sm btn-outline flex items-center gap-1.5"
                  onClick={handleReset}
                  disabled={isInpainting || isTranslating}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                  </svg>
                  <span>New Image</span>
                </button>
              </div>
            </div>
            
            <div className="flex-1 flex overflow-hidden rounded-lg border border-gray-200 shadow-md">
              <div className={`flex-1 relative overflow-hidden ${showTranslationsPanel ? 'border-r border-gray-200' : ''}`}>
                <CanvasEditor 
                  ref={canvasEditorRef}
                  image={uploadedImage} 
                  tool={currentTool}
                  onSelectionsChange={setHasSelections}
                  onSelectionHover={handleSelectionHover}
                  onTextSelection={handleTextSelection}
                />
              </div>
              
              {showTranslationsPanel && (
                <TranslationPanel 
                  translations={translations}
                  onAddTextToCanvas={handleAddTextToCanvas}
                  onSelectionHover={handleSelectionHover}
                  onClose={handleCloseTranslationsPanel}
                />
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex">
            <ImageUploader onImageUpload={handleImageUpload} />
          </div>
        )}
      </main>
      
      {/* API status indicator */}
      {apiConnected === false && (
        <div className="fixed top-3 right-3 bg-red-50 text-red-600 px-3 py-1.5 rounded-lg border border-red-200 text-xs font-medium shadow-sm flex items-center">
          <div className="w-2 h-2 rounded-full bg-red-500 mr-2 animate-pulse"></div>
          API Disconnected
        </div>
      )}
      
      {/* API connected indicator */}
      {apiConnected === true && (
        <div className="fixed top-3 right-3 bg-green-50 text-green-600 px-3 py-1.5 rounded-lg border border-green-200 text-xs font-medium shadow-sm flex items-center">
          <div className="w-2 h-2 rounded-full bg-green-500 mr-2"></div>
          API Connected
        </div>
      )}
      
      {/* Footer/status bar */}
      <div className="py-1 bg-white bg-opacity-90 border-t border-gray-100 text-gray-500 text-center text-xs">
        PanelPachi • {uploadedImage ? 'Scroll: adjust brush size • Ctrl+Scroll: zoom in/out • Ctrl+0: reset zoom • Middle Mouse/Space+drag: pan' : 'Upload an image to begin'}
      </div>
      
      {/* Success/error notification */}
      {snackbarOpen && (
        <div className={`
          fixed bottom-12 left-1/2 transform -translate-x-1/2
          ${alertType === 'success' ? 'bg-green-50 text-green-600 border-green-200' : 'bg-red-50 text-red-600 border-red-200'}
          px-4 py-3 rounded-lg border shadow-lg
          flex items-center gap-2 min-w-[300px] max-w-md
        `}>
          <div className={`w-5 h-5 rounded-full flex items-center justify-center ${alertType === 'success' ? 'bg-green-100' : 'bg-red-100'}`}>
            {alertType === 'success' ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            )}
          </div>
          <div className="flex-1">{snackbarMessage}</div>
          <button 
            onClick={handleSnackbarClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

export default App; 