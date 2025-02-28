import { useEffect, useRef, useState, type FC } from 'react';
import { Canvas, Image as FabricImage, PencilBrush, Rect } from 'fabric';

interface CanvasEditorProps {
  image: File | null;
  tool: string;
}

const CanvasEditor: FC<CanvasEditorProps> = ({ image, tool }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<Canvas | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const brushSizeRef = useRef<number>(20);
  const [loadingStatus, setLoadingStatus] = useState<string>("");
  
  // Add ref to track zoom level
  const zoomRef = useRef<number>(1);
  
  // Add a ref to track pan position
  const panPositionRef = useRef({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  
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
    
    // Get the current zoom level
    const zoom = zoomRef.current;
    
    // Adjust cursor size based on zoom level
    const zoomedSize = size * zoom;
    
    // Create an SVG circle cursor with a dotted stroke
    const circle = `
      <svg
        height="${zoomedSize}"
        width="${zoomedSize}"
        viewBox="0 0 ${zoomedSize} ${zoomedSize}"
        xmlns="http://www.w3.org/2000/svg"
        style="background-color: transparent;"
      >
        <circle
          cx="${zoomedSize / 2}"
          cy="${zoomedSize / 2}"
          r="${(zoomedSize / 2) - 1}"
          stroke="rgba(255, 255, 255, 0.8)"
          stroke-width="1"
          stroke-dasharray="4 2"
          fill="none"
        />
      </svg>
    `;
    
    // Convert the SVG to a data URL
    const svgBlob = new Blob([circle], {type: 'image/svg+xml'});
    const url = URL.createObjectURL(svgBlob);
    
    // Apply the cursor to the container
    containerRef.current.style.cursor = `url('${url}') ${zoomedSize / 2} ${zoomedSize / 2}, crosshair`;
    
    // Clean up the URL once the cursor is applied
    setTimeout(() => URL.revokeObjectURL(url), 100);
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

  // Function to handle zooming
  const zoomCanvas = (delta: number, x: number, y: number) => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    // Get pointer position relative to canvas
    const pointer = canvas.getPointer({ clientX: x, clientY: y });

    // More granular zoom increments for smoother zooming
    const zoomFactor = delta > 0 ? 0.95 : 1.05;
    
    // Get current zoom from the canvas 
    const currentZoom = canvas.getZoom();
    
    // Calculate new zoom level
    let newZoom = currentZoom * zoomFactor;
    
    // Clamp zoom level to reasonable limits (0.2x to 5x)
    newZoom = Math.min(Math.max(newZoom, 0.2), 5);
    
    // Don't do anything if we're already at the limit
    if (newZoom === currentZoom) return;
    
    // Use zoomToPoint with the correct pointer position
    canvas.zoomToPoint({ x: pointer.x, y: pointer.y }, newZoom);
    
    // Update our zoom reference
    zoomRef.current = newZoom;
    
    // Update cursor if we're in mask mode
    if (tool === 'mask') {
      updateBrushCursor(brushSizeRef.current);
    }
    
    // Display current zoom level
    setLoadingStatus(`Zoom: ${Math.round(newZoom * 100)}%`);
    
    // Clear status after a delay
    setTimeout(() => {
      if (loadingStatus && loadingStatus.includes("Zoom")) {
        setLoadingStatus("");
      }
    }, 1500);
    
    // Prevent drawing outside image bounds
    canvas.renderAll();
  };
  
  // Function to reset zoom to 100%
  const resetZoom = () => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    
    // Reset zoom to 1 (100%)
    canvas.setZoom(1);
    
    // Reset pan to center
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    
    // Update our zoom reference
    zoomRef.current = 1;
    
    // Reset any accumulated pan values
    panPositionRef.current = { x: 0, y: 0 };
    
    // Show feedback
    setLoadingStatus("Zoom reset to 100%");
    
    // Clear feedback after a delay
    setTimeout(() => {
      if (loadingStatus && loadingStatus.includes("Zoom")) {
        setLoadingStatus("");
      }
    }, 1000);
  };
  
  // Initialize the canvas only once
  useEffect(() => {
    if (canvasRef.current) {
      try {
        // Get container dimensions for initial setup
        const containerWidth = containerRef.current?.clientWidth || window.innerWidth * 0.9;
        const containerHeight = containerRef.current?.clientHeight || window.innerHeight * 0.8;
        
        setLoadingStatus("Initializing canvas...");
        
        // Initialize canvas with clipPath option to restrict drawing to canvas bounds
        fabricCanvasRef.current = new Canvas(canvasRef.current, {
          isDrawingMode: tool === 'mask',
          backgroundColor: '#111',
          width: containerWidth,
          height: containerHeight,
          selection: false, // Disable selection to prevent accidental selection
          preserveObjectStacking: true, // Maintain stacking order
          fireRightClick: false, // Don't fire right click
          stopContextMenu: true // Prevent context menu
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
  
  // Wheel event for brush size and zooming
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      // Prevent the default behavior first to avoid page scrolling
      e.preventDefault();
      
      // Check if Ctrl key is pressed for zooming
      if (e.ctrlKey || e.metaKey) { // Support Cmd key on Mac
        // Use zoom function with mouse position
        zoomCanvas(e.deltaY, e.clientX, e.clientY);
      } 
      // Otherwise adjust brush size if in mask mode
      else if (tool === 'mask') {
        // Adjust brush size based on wheel direction
        const delta = e.deltaY > 0 ? -2 : 2;
        updateBrushSize(brushSizeRef.current + delta);
      }
    };
    
    // Add keydown and keyup event to show visual feedback when Ctrl is pressed
    const handleKeyDown = (e: KeyboardEvent) => {
      // Handle Ctrl key press for cursor change
      if (e.key === 'Control' || e.key === 'Meta') {
        setLoadingStatus('Ready to zoom (Ctrl+Scroll)');
        if (containerRef.current && containerRef.current.style.cursor !== 'zoom-in') {
          containerRef.current.style.cursor = 'zoom-in';
        }
      }
      
      // Handle Ctrl+0 to reset zoom
      if ((e.ctrlKey || e.metaKey) && (e.key === '0' || e.key === 'NumPad0')) {
        e.preventDefault();
        resetZoom();
      }
      
      // Handle Esc key to cancel current action
      if (e.key === 'Escape') {
        // Reset any pending operations if needed
        setLoadingStatus('');
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') {
        setLoadingStatus('');
        if (!containerRef.current) return;
        
        if (tool === 'mask') {
          updateBrushCursor(brushSizeRef.current);
        } else {
          containerRef.current.style.cursor = 'default';
        }
      }
    };
    
    const container = containerRef.current;
    if (container) {
      // Use passive: false to prevent browser warnings with preventDefault
      container.addEventListener('wheel', handleWheel, { passive: false });
      
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('keyup', handleKeyUp);
    }
    
    return () => {
      if (container) {
        container.removeEventListener('wheel', handleWheel);
      }
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [tool]); // Only depend on tool
  
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
    if (!image) {
      return;
    }
    
    setLoadingStatus("Loading image...");
    
    const reader = new FileReader();
    
    reader.onload = (e) => {
      if (!e.target?.result) {
        setLoadingStatus("Failed to load image");
        return;
      }
      
      // Create an HTML image element
      const htmlImg = new Image();
      htmlImg.src = e.target.result as string;
      
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
          
          // Resize the canvas to match the scaled image dimensions
          canvas.setWidth(scaledWidth);
          canvas.setHeight(scaledHeight);
          
          // Scale the image to fit exactly in the canvas
          fabricImg.scale(scale);
          
          // Center the image in the canvas
          canvas.add(fabricImg);
          canvas.centerObject(fabricImg);
          
          // Make the image non-interactive
          fabricImg.selectable = false;
          fabricImg.evented = false;
          
          // Create a clip path rectangle that exactly matches the image
          // This will prevent drawing outside the image boundaries
          const clipRect = new Rect({
            left: fabricImg.left,
            top: fabricImg.top,
            width: scaledWidth,
            height: scaledHeight,
            absolutePositioned: true
          });
          
          // Set the clip path for the entire canvas
          canvas.clipPath = clipRect;
          
          // Reset zoom level and viewport transform when loading a new image
          zoomRef.current = 1;
          canvas.setZoom(1);
          canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
          
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
          setTimeout(() => setLoadingStatus(""), 1500);
          
        } catch (error) {
          console.error("Error processing image:", error);
          setLoadingStatus("Error processing image");
        }
      };
      
      htmlImg.onerror = () => {
        setLoadingStatus("Failed to load image");
      };
    };
    
    reader.onerror = () => {
      setLoadingStatus("Failed to read image file");
    };
    
    reader.readAsDataURL(image);
  }, [image, tool]); // Don't depend on brushSize here
  
  // Add mouse events for panning
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      // Only allow panning with space bar held or middle mouse button
      if (e.button === 1 || (e.button === 0 && e.getModifierState('Space'))) {
        if (containerRef.current) {
          containerRef.current.style.cursor = 'grabbing';
        }
        isPanningRef.current = true;
        e.preventDefault();
      }
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      const canvas = fabricCanvasRef.current;
      if (!canvas || !isPanningRef.current) return;
      
      // Pan the canvas based on mouse movement
      const delta = {
        x: e.movementX,
        y: e.movementY
      };
      
      // Get current viewport transform
      const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
      
      // Update the transform with the movement delta
      vpt[4] += delta.x;
      vpt[5] += delta.y;
      
      // Update the canvas transform
      canvas.setViewportTransform(vpt);
      
      // Store the pan position for reference
      panPositionRef.current = {
        x: vpt[4],
        y: vpt[5]
      };
      
      e.preventDefault();
    };
    
    const handleMouseUp = (e: MouseEvent) => {
      isPanningRef.current = false;
      
      if (containerRef.current) {
        // Restore appropriate cursor
        if (e.getModifierState('Control') || e.getModifierState('Meta')) {
          containerRef.current.style.cursor = 'zoom-in';
        } else if (tool === 'mask') {
          updateBrushCursor(brushSizeRef.current);
        } else {
          containerRef.current.style.cursor = 'default';
        }
      }
    };
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        if (containerRef.current) {
          containerRef.current.style.cursor = 'grab';
        }
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        if (containerRef.current) {
          if (tool === 'mask') {
            updateBrushCursor(brushSizeRef.current);
          } else {
            containerRef.current.style.cursor = 'default';
          }
        }
        isPanningRef.current = false;
      }
    };
    
    const container = containerRef.current;
    if (container) {
      container.addEventListener('mousedown', handleMouseDown);
      container.addEventListener('mousemove', handleMouseMove);
      container.addEventListener('mouseup', handleMouseUp);
      container.addEventListener('mouseleave', handleMouseUp);
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('keyup', handleKeyUp);
    }
    
    return () => {
      if (container) {
        container.removeEventListener('mousedown', handleMouseDown);
        container.removeEventListener('mousemove', handleMouseMove);
        container.removeEventListener('mouseup', handleMouseUp);
        container.removeEventListener('mouseleave', handleMouseUp);
      }
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [tool]);
  
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
      
      {/* Zoom info overlay */}
      <div style={{
        position: 'absolute',
        top: '10px',
        right: '10px',
        padding: '5px 10px',
        backgroundColor: 'rgba(0,0,0,0.5)',
        color: '#fff',
        borderRadius: '4px',
        fontSize: '12px',
        pointerEvents: 'none'
      }}>
        Ctrl+Scroll: Zoom • Ctrl+0: Reset Zoom
      </div>
    </div>
  );
};

export default CanvasEditor; 