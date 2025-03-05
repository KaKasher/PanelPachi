import { useState, useEffect, useRef } from 'react';
import './App.css';
import ImageUploader from './components/ImageUploader';
import CanvasEditor from './components/CanvasEditor';
import Toolbar from './components/Toolbar';
import { Button, ThemeProvider, createTheme, Tooltip, Snackbar, Alert } from '@mui/material';
import { RestartAlt, Info } from '@mui/icons-material';

// Create a dark theme for MUI components
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#90caf9',
    },
    secondary: {
      main: '#f48fb1',
    },
  },
});

function App() {
  const [uploadedImage, setUploadedImage] = useState<File | null>(null);
  const [currentTool, setCurrentTool] = useState<string>('mask');
  const [isOverflowing, setIsOverflowing] = useState<boolean>(false);
  const [snackbarOpen, setSnackbarOpen] = useState<boolean>(false);
  const [snackbarMessage, setSnackbarMessage] = useState<string>('');
  const [isInpainting, setIsInpainting] = useState<boolean>(false);
  
  // Create a ref for the CanvasEditor component
  const canvasEditorRef = useRef<any>(null);

  // Check for overflow on mount and window resize
  useEffect(() => {
    const checkOverflow = () => {
      const body = document.body;
      const html = document.documentElement;
      
      const documentHeight = Math.max(
        body.scrollHeight, body.offsetHeight,
        html.clientHeight, html.scrollHeight, html.offsetHeight
      );
      
      setIsOverflowing(documentHeight > window.innerHeight);
    };
    
    // Initial check
    checkOverflow();
    
    // Add resize listener
    window.addEventListener('resize', checkOverflow);
    
    // Prevent scrolling
    document.body.style.overflow = 'hidden';
    
    return () => {
      window.removeEventListener('resize', checkOverflow);
      document.body.style.overflow = '';
    };
  }, [uploadedImage]);

  const handleImageUpload = (file: File) => {
    setUploadedImage(file);
  };

  const handleReset = () => {
    setUploadedImage(null);
  };
  
  // Handle export mask functionality
  const handleExportMask = () => {
    if (canvasEditorRef.current && typeof canvasEditorRef.current.exportMask === 'function') {
      setIsInpainting(true);
      canvasEditorRef.current.exportMask()
        .then(() => {
          setSnackbarMessage("Inpainting completed successfully!");
          setSnackbarOpen(true);
          setIsInpainting(false);
        })
        .catch((error: any) => {
          setSnackbarMessage(`Inpainting failed: ${error.message || 'Unknown error'}`);
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
  
  const handleSnackbarClose = () => {
    setSnackbarOpen(false);
  };

  return (
    <ThemeProvider theme={darkTheme}>
      <div className="App" style={{
        backgroundColor: '#000',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        color: 'white',
        overflow: 'hidden',
      }}>
        <header style={{ 
          padding: '0.25rem 1rem', 
          textAlign: 'center',
          borderBottom: '1px solid #333',
          flexShrink: 0
        }}>
          <h1 style={{ margin: '0.25rem 0', fontSize: '1.5rem' }}>PanelPachi - Manga SFX Editor</h1>
        </header>
        
        <main style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: uploadedImage ? '0.25rem' : '0.5rem',
          maxWidth: '1800px',
          margin: '0 auto',
          width: '100%',
          overflow: 'hidden'
        }}>
          {uploadedImage ? (
            <>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.25rem',
                flexShrink: 0
              }}>
                <Toolbar 
                  currentTool={currentTool} 
                  onToolChange={setCurrentTool}
                  onExportMask={handleExportMask}
                  onUndo={handleUndo}
                  isInpainting={isInpainting}
                />
                
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <Tooltip title={`${uploadedImage.name} (${Math.round(uploadedImage.size / 1024)} KB)`}>
                    <Info fontSize="small" style={{ marginRight: '0.5rem', opacity: 0.7 }} />
                  </Tooltip>
                  
                  <Button
                    variant="contained"
                    color="secondary"
                    startIcon={<RestartAlt />}
                    onClick={handleReset}
                    size="small"
                    disabled={isInpainting}
                  >
                    New Image
                  </Button>
                </div>
              </div>
              
              <div style={{ 
                flex: 1,
                border: '1px solid #333',
                borderRadius: '4px',
                overflow: 'hidden',
                position: 'relative'
              }}>
                <CanvasEditor 
                  ref={canvasEditorRef}
                  image={uploadedImage} 
                  tool={currentTool} 
                />
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex' }}>
              <ImageUploader onImageUpload={handleImageUpload} />
            </div>
          )}
        </main>
        
        {/* Compact footer embedded at the bottom of the canvas area */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontSize: '0.7rem',
            padding: '0.1rem',
            backgroundColor: 'rgba(0,0,0,0.7)',
            color: 'rgba(255,255,255,0.5)',
            zIndex: 10,
            pointerEvents: 'none'
          }}
        >
          PanelPachi • {uploadedImage ? 'Scroll: adjust brush size • Ctrl+Scroll: zoom in/out • Ctrl+0: reset zoom • Space+drag: pan' : 'Upload an image to begin'}
        </div>
        
        {/* Warning for viewport overflow */}
        {isOverflowing && (
          <div style={{
            position: 'fixed',
            top: '50%',
            right: '10px',
            transform: 'translateY(-50%)',
            backgroundColor: 'rgba(255,0,0,0.7)',
            color: 'white',
            padding: '0.5rem',
            borderRadius: '4px',
            fontSize: '0.8rem',
            zIndex: 1000
          }}>
            Warning: Content may not fit screen
          </div>
        )}
        
        {/* Success notification */}
        <Snackbar 
          open={snackbarOpen} 
          autoHideDuration={4000} 
          onClose={handleSnackbarClose}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert 
            onClose={handleSnackbarClose} 
            severity={snackbarMessage.includes('failed') ? 'error' : 'success'} 
            sx={{ width: '100%' }}
          >
            {snackbarMessage}
          </Alert>
        </Snackbar>
      </div>
    </ThemeProvider>
  );
}

export default App;
