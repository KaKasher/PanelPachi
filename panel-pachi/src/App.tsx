import { useState, useEffect, useRef } from 'react';
import ImageUploader from './components/ImageUploader';
import CanvasEditor from './components/CanvasEditor';
import Toolbar from './components/Toolbar';
import TranslationPanel from './components/TranslationPanel';
import type { CanvasEditorRef } from './components/CanvasEditor';
import type { Translation } from './components/TranslationPanel';
// Import the manga image
import mangaImage from './assets/manga.jpg';

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
  const [hasSelections, setHasSelections] = useState<boolean>(false);
  const [showTranslationsPanel, setShowTranslationsPanel] = useState<boolean>(false);
  const [translations, setTranslations] = useState<Translation[]>([]);
  
  // Add state for snackbar exit animation
  const [isSnackbarExiting, setIsSnackbarExiting] = useState<boolean>(false);
  
  // Create a ref for tracking snackbar auto-dismiss timer
  const snackbarTimerRef = useRef<number | null>(null);
  
  // Create a ref for the CanvasEditor component
  const canvasEditorRef = useRef<CanvasEditorRef>(null);

  // Preload manga image when the app starts
  useEffect(() => {
    const loadMangaImage = async () => {
      try {
        // Fetch the image
        const response = await fetch(mangaImage);
        const blob = await response.blob();
        
        // Create a File object from the blob
        const file = new File([blob], 'manga.jpg', { type: 'image/jpeg' });
        
        // Set the uploaded image
        setUploadedImage(file);
      } catch (error) {
        console.error('Failed to load manga image:', error);
      }
    };
    
    loadMangaImage();
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
    setIsInpainting(true);
    if (canvasEditorRef.current && typeof canvasEditorRef.current.exportMask === 'function') {
      canvasEditorRef.current.exportMask()
        .then(() => {
          setIsInpainting(false);
          setSnackbarMessage("Inpainting completed successfully!");
          setAlertType('success');
          setSnackbarOpen(true);
        })
        .catch((error) => {
          setIsInpainting(false);
          setSnackbarMessage(`Inpainting failed: ${error.message || 'Unknown error'}`);
          setAlertType('error');
          setSnackbarOpen(true);
        });
    }
  };
  
  // Handle saving the edited image
  const handleSaveImage = async () => {
    if (!canvasEditorRef.current || !uploadedImage) return;
    
    try {
      const blob = await canvasEditorRef.current.exportImage();
      
      if (!blob) {
        setSnackbarMessage("Failed to export image");
        setAlertType('error');
        setSnackbarOpen(true);
        return;
      }
      
      // Create a download link for the blob
      const url = URL.createObjectURL(blob);
      
      // Create a filename based on the original image name
      const originalName = uploadedImage.name;
      const baseName = originalName.substring(0, originalName.lastIndexOf('.'));
      const newFilename = `${baseName}_edited.png`; // Always save as PNG
      
      // Create a download link
      const a = document.createElement('a');
      a.href = url;
      a.download = newFilename;
      
      // Append to body, click, and then remove
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // Clean up the URL
      URL.revokeObjectURL(url);
      
      setSnackbarMessage("Image saved successfully");
      setAlertType('success');
      setSnackbarOpen(true);
    } catch (error) {
      console.error("Error saving image:", error);
      setSnackbarMessage(`Error saving image: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setAlertType('error');
      setSnackbarOpen(true);
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
    if (!canvasEditorRef.current) {
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
    
    // Clear all selection boxes when the panel is closed
    if (canvasEditorRef.current) {
      canvasEditorRef.current.clearSelections();
    }
    
    // Update text positions after panel closes
    // This is necessary because the layout changes can affect positioning
    setTimeout(() => {
      canvasEditorRef.current?.updateTextPositions?.();
    }, 100); // Small delay to allow layout to update
  };
  
  const handleSnackbarClose = () => {
    // Start exit animation
    setIsSnackbarExiting(true);
    
    // Wait for animation to complete before removing from DOM
    setTimeout(() => {
      setSnackbarOpen(false);
      setIsSnackbarExiting(false);
    }, 300); // Match this with animation duration in tailwind config
  };

  // Update handleTextSelection to remove text options
  const handleTextSelection = () => {
    // We've removed text styling options, so this function is simplified
    // It may still be needed for other functionality, so we're keeping it minimal
  };

  // Auto-dismiss snackbar after a timeout
  useEffect(() => {
    if (snackbarOpen && !isSnackbarExiting) {
      // Clear any existing timer
      if (snackbarTimerRef.current !== null) {
        clearTimeout(snackbarTimerRef.current);
      }
      
      // Set a new timer to close the snackbar after 5 seconds
      snackbarTimerRef.current = window.setTimeout(() => {
        // Start exit animation
        setIsSnackbarExiting(true);
        
        // Wait for animation to complete before removing from DOM
        setTimeout(() => {
          setSnackbarOpen(false);
          setIsSnackbarExiting(false);
        }, 300); // Match this with animation duration in tailwind config
        
        snackbarTimerRef.current = null;
      }, 5000); // 5 seconds
    }
    
    // Cleanup function to clear the timer when component unmounts or snackbar closes
    return () => {
      if (snackbarTimerRef.current !== null) {
        clearTimeout(snackbarTimerRef.current);
        snackbarTimerRef.current = null;
      }
    };
  }, [snackbarOpen, snackbarMessage, isSnackbarExiting]);

  return (
    <div className="h-screen max-h-screen flex flex-col text-gray-800 overflow-hidden">
      <header className="py-2 px-4 border-b border-gray-100 shadow-sm bg-white">
        <h1 className="text-2xl font-semibold text-center text-gray-800">
          <span className="text-primary-500">Panel</span>Pachi - AI Manga Editing Tool
        </h1>
      </header>
      
      <main className="flex-1 flex flex-col overflow-hidden max-w-[1800px] mx-auto w-full p-4">
        {uploadedImage ? (
          <>
            <div className="flex justify-between items-center mb-4">
              <Toolbar 
                currentTool={currentTool} 
                onToolChange={handleToolChange}
                onExportMask={handleExportMask}
                onUndo={handleUndo}
                onTranslateSelected={handleTranslateSelected}
                isInpainting={isInpainting}
                isTranslating={isTranslating}
                hasSelections={hasSelections}
              />
              
              <div className="flex items-center">
                <div className="text-xs text-gray-500 mr-3">
                  {uploadedImage.name} ({Math.round(uploadedImage.size / 1024)} KB)
                </div>
                
                <button
                  className="btn btn-sm btn-outline flex items-center gap-1.5 mr-2"
                  onClick={handleSaveImage}
                  disabled={isInpainting || isTranslating}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M7.707 10.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V6h5a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2h5v5.586l-1.293-1.293zM9 4a1 1 0 012 0v2H9V4z" />
                  </svg>
                  <span>Save Image</span>
                </button>
                
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
                
                <a 
                  href="https://ko-fi.com/O4O71C9SOV" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="btn btn-sm flex items-center gap-1.5 ml-2"
                  style={{ backgroundColor: '#2df0e6', color: 'white', borderColor: '#2df0e6' }}
                  title="GPUs are expensive :(("
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M23.881 8.948c-.773-4.085-4.859-4.593-4.859-4.593H.723c-.604 0-.679.798-.679.798s-.082 7.324-.022 11.822c.164 2.424 2.586 2.672 2.586 2.672s8.267-.023 11.966-.049c2.438-.426 2.683-2.566 2.658-3.734 4.352.24 7.422-2.831 6.649-6.916zm-11.062 3.511c-1.246 1.453-4.011 3.976-4.011 3.976s-.121.119-.31.023c-.076-.057-.108-.09-.108-.09-.443-.441-3.368-3.049-4.034-3.954-.709-.965-1.041-2.7-.091-3.71.951-1.01 3.005-1.086 4.363.407 0 0 1.565-1.782 3.468-.963 1.904.82 1.832 3.011.723 4.311zm6.173.478c-.928.116-1.682.028-1.682.028V7.284h1.77s1.971.551 1.971 2.638c0 1.913-.985 2.667-2.059 3.015z"/>
                  </svg>
                  <span>Support the app</span>
                </a>
                
                <a 
                  href="https://github.com/KaKasher/PanelPachi" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="btn btn-sm btn-outline flex items-center gap-1.5 ml-2"
                  title="View on GitHub"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                  <span>GitHub</span>
                </a>
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
          ${isSnackbarExiting ? 'animate-snackbar-out' : 'animate-snackbar-in'}
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
            className="text-gray-400 hover:text-gray-600 transition-colors"
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