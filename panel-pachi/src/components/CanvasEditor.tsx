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
  const brushSizeRef = useRef<number>(20);
  const [loadingStatus, setLoadingStatus] = useState<string>("");
  
  // Add a style element to force cursor inheritance in all canvas elements
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      .canvas-container, .upper-canvas, .lower-canvas {
        cursor: inherit !important;
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);
  
  // Function to update brush cursor with dotted circle
  const updateBrushCursor = (size: number) => {
    if (!containerRef.current) return;
    
    // Create circular cursor with dotted outline to represent brush size
    const cursorSize = size;
    const cursorCanvas = document.createElement('canvas');
    const padding = 4; // Extra padding for the cursor
    cursorCanvas.width = cursorSize + padding * 2;
    cursorCanvas.height = cursorSize + padding * 2;
    
    const ctx = cursorCanvas.getContext('2d');
    if (ctx) {
      // Draw circle with dotted outline
      ctx.beginPath();
      
      // Create dotted circle
      ctx.setLineDash([3, 3]); // Create dotted line effect
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      
      // Draw circle in center of canvas
      ctx.arc(
        cursorSize / 2 + padding, 
        cursorSize / 2 + padding, 
        cursorSize / 2, 
        0, 
        Math.PI * 2
      );
      ctx.stroke();
      
      // Add red overlay with transparency
      ctx.setLineDash([]); // Reset to solid
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    
    const dataURL = cursorCanvas.toDataURL();
    
    // Apply the cursor to the container when in mask mode
    if (tool === 'mask') {
      // Position cursor so the hotspot is in the middle of the circle
      const hotspot = Math.floor(cursorSize / 2) + padding;
      containerRef.current.style.cursor = `url(${dataURL}) ${hotspot} ${hotspot}, crosshair`;
    } else {
      containerRef.current.style.cursor = 'default';
    }
  };
  
  // Update brush size without triggering re-renders
  const updateBrushSize = (newSize: number) => {
    // Clamp value between 5 and 50
    const clampedSize = Math.min(Math.max(newSize, 5), 50);
    
    // Update the ref instead of state to avoid re-renders
    brushSizeRef.current = clampedSize;
    
    if (fabricCanvasRef.current && fabricCanvasRef.current.freeDrawingBrush) {
      fabricCanvasRef.current.freeDrawingBrush.width = clampedSize;
      updateBrushCursor(clampedSize);
    }
  };
  
  // Initialize the canvas only once
  useEffect(() => {
    if (canvasRef.current) {
      try {
        // Get container dimensions for initial setup
        const containerWidth = containerRef.current?.clientWidth || window.innerWidth * 0.9;
        const containerHeight = containerRef.current?.clientHeight || window.innerHeight * 0.8;
        
        setLoadingStatus("Initializing canvas...");
        
        // Initialize canvas - we'll resize it when the image loads
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
        pencilBrush.width = brushSizeRef.current;
        canvas.freeDrawingBrush = pencilBrush;
        
        // Initialize cursor
        updateBrushCursor(brushSizeRef.current);
        
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
  }, [tool]); // Only depend on tool, not on brushSize
  
  // Wheel event for brush size that doesn't cause re-renders
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (tool === 'mask') {
        e.preventDefault();
        // Adjust brush size based on wheel direction
        const delta = e.deltaY > 0 ? -2 : 2;
        updateBrushSize(brushSizeRef.current + delta);
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
  }, [tool]); // Only depend on tool, not brushSize
  
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
        fabricCanvasRef.current.freeDrawingBrush.width = brushSizeRef.current;
        
        // Update cursor
        updateBrushCursor(brushSizeRef.current);
      } else {
        // Reset cursor
        if (containerRef.current) {
          containerRef.current.style.cursor = 'default';
        }
      }
    }
  }, [tool]); // Only depend on tool, not brushSize
  
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
          
          // Get container dimensions
          const containerWidth = containerRef.current.clientWidth;
          const containerHeight = containerRef.current.clientHeight;
          
          // Get image dimensions
          const imgWidth = fabricImg.width || htmlImg.width || 800;
          const imgHeight = fabricImg.height || htmlImg.height || 600;
          
          setLoadingStatus(`Image: ${imgWidth}x${imgHeight}`);
          
          // Calculate scale to fit in the container while maintaining aspect ratio
          const scaleWidth = containerWidth / imgWidth;
          const scaleHeight = containerHeight / imgHeight;
          const scale = Math.min(scaleWidth, scaleHeight) * 0.95; // 95% of container to leave margin
          
          // Calculate the scaled dimensions
          const scaledWidth = Math.round(imgWidth * scale);
          const scaledHeight = Math.round(imgHeight * scale);
          
          setLoadingStatus(`Scaled dimensions: ${scaledWidth}x${scaledHeight}`);
          
          // IMPORTANT: Resize the canvas to match the scaled image dimensions
          // This ensures users can only draw within the image area
          canvas.setWidth(scaledWidth);
          canvas.setHeight(scaledHeight);
          
          // Scale the image to fit exactly in the canvas
          // Use the scale method as defined in the Fabric.js type definition
          fabricImg.scale(scale);
          
          // Center the image in the canvas (should fill it exactly)
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
              canvas.freeDrawingBrush.width = brushSizeRef.current;
              
              // Update cursor
              updateBrushCursor(brushSizeRef.current);
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
            scaledWidth,
            scaledHeight,
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
  }, [image, tool]); // Don't depend on brushSize here
  
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
      <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: '100%' }} />
      
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