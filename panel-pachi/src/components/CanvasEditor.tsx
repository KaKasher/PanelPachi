import React, { useEffect, useRef, useState } from 'react';
import { Canvas, Image as FabricImage, PencilBrush } from 'fabric';

interface CanvasEditorProps {
  image: File | null;
  tool: string;
}

const CanvasEditor: React.FC<CanvasEditorProps> = ({ image, tool }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<Canvas | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [brushSize, setBrushSize] = useState<number>(20);
  const [loadingStatus, setLoadingStatus] = useState<string>("");
  
  // Function to update brush cursor
  const updateBrushCursor = (size: number) => {
    if (!containerRef.current) return;
    
    // Create circular cursor to represent brush size
    const cursorSize = size;
    const cursorColor = 'rgba(255, 0, 0, 0.5)';
    
    // Create a cursor style with a circle representing the brush
    const cursorCanvas = document.createElement('canvas');
    cursorCanvas.width = cursorSize * 2;
    cursorCanvas.height = cursorSize * 2;
    
    const ctx = cursorCanvas.getContext('2d');
    if (ctx) {
      // Draw circle
      ctx.beginPath();
      ctx.arc(cursorSize, cursorSize, cursorSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = cursorColor;
      ctx.fill();
      
      // Add border for better visibility
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    
    const dataURL = cursorCanvas.toDataURL();
    
    // Apply the cursor to the container when in mask mode
    if (tool === 'mask') {
      containerRef.current.style.cursor = `url(${dataURL}) ${cursorSize}, auto`;
    } else {
      containerRef.current.style.cursor = 'default';
    }
  };
  
  // Update brush size and cursor
  const updateBrushSize = (newSize: number) => {
    // Clamp value between 5 and 50
    const clampedSize = Math.min(Math.max(newSize, 5), 50);
    
    setBrushSize(clampedSize);
    
    if (fabricCanvasRef.current && fabricCanvasRef.current.freeDrawingBrush) {
      fabricCanvasRef.current.freeDrawingBrush.width = clampedSize;
      updateBrushCursor(clampedSize);
    }
  };
  
  // Initialize the canvas
  useEffect(() => {
    if (canvasRef.current) {
      try {
        // Get container dimensions for initial setup
        const containerWidth = containerRef.current?.clientWidth || window.innerWidth * 0.9;
        const containerHeight = containerRef.current?.clientHeight || window.innerHeight * 0.8;
        
        setLoadingStatus("Initializing canvas...");
        
        // Initialize canvas with larger size for better visibility
        fabricCanvasRef.current = new Canvas(canvasRef.current, {
          isDrawingMode: tool === 'mask',
          backgroundColor: '#111',
          width: containerWidth,
          height: containerHeight
        });
        
        const canvas = fabricCanvasRef.current;
        
        // Initialize the brush properly
        const pencilBrush = new PencilBrush(canvas);
        pencilBrush.color = 'rgba(255, 0, 0, 0.5)';
        pencilBrush.width = brushSize;
        canvas.freeDrawingBrush = pencilBrush;
        
        // Initialize cursor
        updateBrushCursor(brushSize);
        
        setLoadingStatus("Canvas ready");
      } catch (error) {
        console.error("Error initializing canvas:", error);
        setLoadingStatus("Error initializing canvas");
      }
      
      return () => {
        if (fabricCanvasRef.current) {
          fabricCanvasRef.current.dispose();
          fabricCanvasRef.current = null;
        }
      };
    }
  }, [tool, brushSize]);
  
  // Wheel event for brush size
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (tool === 'mask') {
        e.preventDefault();
        // Adjust brush size based on wheel direction
        const delta = e.deltaY > 0 ? -2 : 2;
        updateBrushSize(brushSize + delta);
      }
    };
    
    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
    }
    
    return () => {
      if (container) {
        container.removeEventListener('wheel', handleWheel);
      }
    };
  }, [tool, brushSize]);
  
  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (fabricCanvasRef.current && containerRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const containerHeight = containerRef.current.clientHeight;
        
        fabricCanvasRef.current.setWidth(containerWidth);
        fabricCanvasRef.current.setHeight(containerHeight);
        fabricCanvasRef.current.renderAll();
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Update tool when it changes
  useEffect(() => {
    if (fabricCanvasRef.current) {
      fabricCanvasRef.current.isDrawingMode = tool === 'mask';
      
      // Make sure we update the brush when tool changes
      if (tool === 'mask' && fabricCanvasRef.current.freeDrawingBrush) {
        fabricCanvasRef.current.freeDrawingBrush.color = 'rgba(255, 0, 0, 0.5)';
        fabricCanvasRef.current.freeDrawingBrush.width = brushSize;
        
        // Update cursor
        updateBrushCursor(brushSize);
      } else {
        // Reset cursor
        if (containerRef.current) {
          containerRef.current.style.cursor = 'default';
        }
      }
    }
  }, [tool, brushSize]);
  
  // Load the image when it changes
  useEffect(() => {
    if (!image || !fabricCanvasRef.current) {
      return;
    }
    
    setLoadingStatus("Reading image file...");
    
    const reader = new FileReader();
    
    reader.onload = (e) => {
      if (!e.target?.result) {
        setLoadingStatus("Failed to read image data");
        return;
      }
      
      setLoadingStatus("Creating image...");
      const imageUrl = e.target.result as string;
      const htmlImg = new window.Image();
      
      htmlImg.onload = () => {
        if (!fabricCanvasRef.current || !containerRef.current) {
          setLoadingStatus("Canvas not available");
          return;
        }

        setLoadingStatus("Processing image...");
        
        try {
          // Create Fabric Image from HTML Image
          const fabricImg = new FabricImage(htmlImg);
          const canvas = fabricCanvasRef.current;
          
          // Clear the canvas
          canvas.clear();
          
          // Get container dimensions - make sure these are correct
          const containerWidth = containerRef.current.clientWidth;
          const containerHeight = containerRef.current.clientHeight;
          
          setLoadingStatus(`Container: ${containerWidth}x${containerHeight}`);
          
          // Make sure canvas is sized correctly to container
          canvas.setWidth(containerWidth);
          canvas.setHeight(containerHeight);
          
          // Get image dimensions - handle case where fabric doesn't have dimensions
          const imgWidth = fabricImg.width || htmlImg.width || 800;
          const imgHeight = fabricImg.height || htmlImg.height || 600;
          
          setLoadingStatus(`Image: ${imgWidth}x${imgHeight}`);
          
          // Calculate scale to fill more of the container (maximize display size)
          const scaleWidth = containerWidth / imgWidth;
          const scaleHeight = containerHeight / imgHeight;
          let scale = Math.min(scaleWidth, scaleHeight);
          
          // Scale to 95% of the container to leave some margin
          scale = scale * 0.95;
          
          setLoadingStatus(`Scale: ${scale.toFixed(2)}`);
          
          // Apply scale and add to canvas
          fabricImg.scale(scale);
          canvas.add(fabricImg);
          canvas.centerObject(fabricImg);
          
          // Make the image non-interactive
          fabricImg.selectable = false;
          fabricImg.evented = false;
          
          // Re-initialize brush after image load to ensure it works
          if (tool === 'mask') {
            canvas.isDrawingMode = true;
            if (canvas.freeDrawingBrush) {
              canvas.freeDrawingBrush.color = 'rgba(255, 0, 0, 0.5)';
              canvas.freeDrawingBrush.width = brushSize;
              
              // Update cursor
              updateBrushCursor(brushSize);
            }
          }
          
          canvas.renderAll();
          
          setLoadingStatus("Image loaded successfully");
          
          // Log for debugging
          console.log('Image loaded', {
            containerWidth,
            containerHeight,
            imgWidth,
            imgHeight,
            scale,
            imageUrlLength: imageUrl.length,
            htmlImgComplete: htmlImg.complete,
            htmlImgSize: `${htmlImg.width}x${htmlImg.height}`
          });
        } catch (error) {
          console.error('Error loading image to canvas:', error);
          setLoadingStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      };
      
      htmlImg.onerror = (error) => {
        console.error('Error loading HTML image:', error);
        setLoadingStatus("Failed to load image");
      };
      
      // Set crossOrigin to anonymous to avoid tainted canvas issues
      htmlImg.crossOrigin = "anonymous";
      htmlImg.src = imageUrl;
    };
    
    reader.onerror = (error) => {
      console.error('Error reading file:', error);
      setLoadingStatus("Error reading file");
    };
    
    reader.readAsDataURL(image);
  }, [image, tool, brushSize]);
  
  return (
    <div 
      ref={containerRef}
      style={{ 
        width: '100%', 
        height: '100%',
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'center', 
        alignItems: 'center',
        backgroundColor: '#111',
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      <canvas ref={canvasRef} />
      
      {/* Brush size indicator */}
      {tool === 'mask' && (
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          padding: '5px 10px',
          backgroundColor: 'rgba(0,0,0,0.7)',
          color: '#fff',
          borderRadius: '4px',
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <div style={{
            width: `${brushSize}px`,
            height: `${brushSize}px`,
            borderRadius: '50%',
            backgroundColor: 'rgba(255,0,0,0.5)',
            border: '1px solid white'
          }} />
          <span>Brush: {brushSize}px (Scroll to adjust)</span>
        </div>
      )}
      
      {/* Loading status overlay */}
      {loadingStatus && (
        <div style={{
          position: 'absolute',
          bottom: '10px',
          left: '10px',
          padding: '5px 10px',
          backgroundColor: 'rgba(0,0,0,0.7)',
          color: '#fff',
          borderRadius: '4px',
          fontSize: '12px',
          pointerEvents: 'none'
        }}>
          Status: {loadingStatus}
        </div>
      )}
    </div>
  );
};

export default CanvasEditor; 