import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Canvas, Image as FabricImage, PencilBrush, Rect, Text, Textbox } from 'fabric';
import { Translation } from './TranslationPanel';

// Need to import fabric globally for access to Text objects
// @ts-ignore
import 'fabric';

interface CanvasEditorProps {
  image: File | null;
  tool: string;
  onSelectionsChange?: (hasSelections: boolean) => void;
  onSelectionHover?: (id: string | null) => void;
  onTextSelection?: (isTextSelected: boolean) => void;
}

// Create a type for the functions that will be exposed via the ref
export interface CanvasEditorRef {
  exportMask: () => Promise<void>;
  undo: () => void;
  getSelections: () => { id: string, left: number, top: number, width: number, height: number }[];
  clearSelections: () => void;
  highlightSelection: (id: string | null) => void;
  addTextToCanvas: (translation: Translation) => void;
  isTextSelected: () => boolean;
  updateTextPositions: () => void; // Add this new method
  exportImage: () => Promise<Blob | null>; // Add new method to export the canvas as an image
}

// Add API URL configuration
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Type for selection objects
interface SelectionRect {
  id: string;
  fabricObject: Rect;
  bounds: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

// Define a type for history actions
type HistoryAction = {
  type: 'path' | 'selection' | 'inpainting';
  data: any;
};

const CanvasEditor = forwardRef<CanvasEditorRef, CanvasEditorProps>(({ image, tool, onSelectionsChange, onSelectionHover, onTextSelection }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<Canvas | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const brushSizeRef = useRef<number>(20);
  const [loadingStatus, setLoadingStatus] = useState<string>("");
  const [isInpainting, setIsInpainting] = useState<boolean>(false);
  const isInpaintingRef = useRef<boolean>(false);
  
  // Add font loading state
  const [fontLoaded, setFontLoaded] = useState<boolean>(false);
  
  // Load the custom font before rendering
  useEffect(() => {
    // Create a FontFace object to load the font
    const customFont = new FontFace('SF Toontime', 'url(./fonts/SF_Toontime.ttf)');
    
    // Load the font
    customFont.load().then((loadedFont) => {
      // Add the font to the document
      document.fonts.add(loadedFont);
      setFontLoaded(true);
      console.log('SF Toontime font loaded successfully');
    }).catch((error) => {
      console.error('Failed to load SF Toontime font:', error);
      // Set font loaded to true anyway so the app doesn't hang
      setFontLoaded(true);
    });
  }, []);
  
  // Store original image dimensions for export
  const originalImageDimensionsRef = useRef<{ width: number, height: number } | null>(null);
  
  // Add ref to track zoom level
  const zoomRef = useRef<number>(1);
  
  // Add a ref to track pan position
  const panPositionRef = useRef({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  
  // Store the original image for comparison
  const originalImageDataRef = useRef<string | null>(null);
  // Store a reference to the original image file
  const originalImageFileRef = useRef<File | null>(null);
  // Store the current inpainted image as a blob
  const currentImageBlobRef = useRef<Blob | null>(null);
  // Stack to track drawable objects for undo functionality
  const historyStackRef = useRef<HistoryAction[]>([]);
  
  // Ref for tracking selections
  const selectionsRef = useRef<SelectionRect[]>([]);
  // Ref for tracking current selection being drawn
  const currentSelectionRef = useRef<Rect | null>(null);
  // Ref to track selection counter
  const selectionCounterRef = useRef<number>(0);
  // Ref for starting point of rectangle
  const startPointRef = useRef<{ x: number, y: number } | null>(null);
  
  // Add ref for tracking the currently selected text element
  const selectedTextRef = useRef<Text | null>(null);
  
  // Add a ref to store the onTextSelection callback
  const onTextSelectionRef = useRef(onTextSelection);
  
  // Expose functions to the parent component via ref
  useImperativeHandle(ref, () => ({
    exportMask: () => {
      return inpaintImage();
    },
    undo: () => {
      undoLastAction();
    },
    getSelections: () => {
      // We need to convert from canvas coordinates to original image coordinates
      if (!fabricCanvasRef.current || !originalImageDimensionsRef.current) {
        return selectionsRef.current.map(selection => ({
          id: selection.id,
          ...selection.bounds
        }));
      }
      
      const canvas = fabricCanvasRef.current;
      
      // Get the background image (first object) to calculate the transformation
      const objects = canvas.getObjects();
      const backgroundImage = objects.find(obj => obj instanceof FabricImage);
      
      if (!backgroundImage || !(backgroundImage instanceof FabricImage)) {
        return selectionsRef.current.map(selection => ({
          id: selection.id,
          ...selection.bounds
        }));
      }
      
      // Original image dimensions
      const originalWidth = originalImageDimensionsRef.current.width;
      const originalHeight = originalImageDimensionsRef.current.height;
      
      // Image scaling
      const imgWidth = backgroundImage.width || 1;
      const imgHeight = backgroundImage.height || 1;
      const imgScaleX = (backgroundImage as any).scaleX || 1;
      const imgScaleY = (backgroundImage as any).scaleY || 1;
      const imgLeft = backgroundImage.left || 0;
      const imgTop = backgroundImage.top || 0;
      
      // Calculate scaling factors
      const scaleX = (imgWidth * imgScaleX) / originalWidth;
      const scaleY = (imgHeight * imgScaleY) / originalHeight;
      
      // Map selections to their original image coordinates
      return selectionsRef.current.map(selection => {
        const { left, top, width, height } = selection.bounds;
        
        // Transform from canvas to image coordinates
        const originalLeft = (left - imgLeft) / scaleX;
        const originalTop = (top - imgTop) / scaleY;
        const originalWidth = width / scaleX;
        const originalHeight = height / scaleY;
        
        return {
          id: selection.id,
          left: originalLeft,
          top: originalTop,
          width: originalWidth,
          height: originalHeight
        };
      });
    },
    clearSelections: () => {
      clearAllSelections();
    },
    highlightSelection: (id: string | null) => {
      highlightSelectionById(id);
    },
    addTextToCanvas: (translation: Translation) => {
      addTranslatedTextToCanvas(translation);
    },
    isTextSelected: () => {
      return selectedTextRef.current !== null;
    },
    updateTextPositions: () => {
      updateTextElementPositions();
    },
    exportImage: () => {
      return exportCanvasAsImage();
    }
  }));
  
  // Function to add translated text to the canvas
  const addTranslatedTextToCanvas = async (translation: Translation) => {
    if (!fabricCanvasRef.current || !originalImageDimensionsRef.current) return;
    
    const canvas = fabricCanvasRef.current;
    
    try {
      // Show loading status
      setLoadingStatus(translation.useInpainting ? "Inpainting text area..." : "Adding text to image...");
      
      // Ensure the font is loaded
      if (!fontLoaded) {
        setLoadingStatus("Loading font...");
        // Wait for the font to load with a timeout
        await new Promise<void>((resolve) => {
          const checkFont = () => {
            if (document.fonts.check('12px "SF Toontime"')) {
              resolve();
            } else {
              setTimeout(checkFont, 100);
            }
          };
          
          // Set a max timeout of 3 seconds
          const timeout = setTimeout(() => {
            console.warn('Font loading timed out, proceeding anyway');
            resolve();
          }, 3000);
          
          checkFont();
          
          // Clear timeout if resolved
          return () => clearTimeout(timeout);
        });
      }
      
      // Get the background image (first object) to calculate the transformation
      const objects = canvas.getObjects();
      const backgroundImage = objects.find(obj => obj instanceof FabricImage);
      
      if (!backgroundImage || !(backgroundImage instanceof FabricImage)) {
        console.error("Background image not found for coordinate transformation");
        setLoadingStatus("Error: Background image not found");
        setTimeout(() => setLoadingStatus(""), 1500);
        return;
      }
      
      // Get the original image dimensions
      const originalDimensions = originalImageDimensionsRef.current;
      
      // Get the background image scaling and position
      const imgWidth = backgroundImage.width || 1;
      const imgHeight = backgroundImage.height || 1;
      const imgScaleX = (backgroundImage as any).scaleX || 1;
      const imgScaleY = (backgroundImage as any).scaleY || 1;
      const imgLeft = backgroundImage.left || 0;
      const imgTop = backgroundImage.top || 0;
      
      // Calculate scaling factors to map from original image coordinates to canvas coordinates
      const scaleX = (imgWidth * imgScaleX) / originalDimensions.width;
      const scaleY = (imgHeight * imgScaleY) / originalDimensions.height;
      
      // Transform coordinates from original image to canvas
      const canvasLeft = translation.bounds.left * scaleX + imgLeft;
      const canvasTop = translation.bounds.top * scaleY + imgTop;
      const canvasWidth = translation.bounds.width * scaleX;
      const canvasHeight = translation.bounds.height * scaleY;
      
      // Use inpainting if requested
      if (translation.useInpainting) {
        // Set inpainting state
        setIsInpainting(true);
        isInpaintingRef.current = true;
        
        try {
          // Create a mask for the inpainting (a black image with white rectangle where text should be removed)
          const maskCanvas = document.createElement('canvas');
          maskCanvas.width = originalDimensions.width;
          maskCanvas.height = originalDimensions.height;
          const maskCtx = maskCanvas.getContext('2d');
          
          if (!maskCtx) {
            throw new Error("Failed to create mask context");
          }
          
          // Fill the canvas with black (areas to keep)
          maskCtx.fillStyle = '#000000';
          maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
          
          // Draw a white rectangle where we want to inpaint (areas to remove)
          maskCtx.fillStyle = '#ffffff';
          maskCtx.fillRect(
            translation.bounds.left,
            translation.bounds.top,
            translation.bounds.width,
            translation.bounds.height
          );
          
          // Get blobs for API call
          const maskBlob = await new Promise<Blob | null>((resolve) => {
            maskCanvas.toBlob((blob) => resolve(blob), 'image/png');
          });
          
          // Get the current image blob
          let imageBlob: Blob | null = null;
          
          if (currentImageBlobRef.current) {
            // Use the current image if available
            imageBlob = currentImageBlobRef.current;
          } else if (originalImageFileRef.current) {
            // Use the original file
            const reader = new FileReader();
            imageBlob = await new Promise<Blob | null>((resolveBlob) => {
              reader.onload = async (event) => {
                if (event.target?.result) {
                  try {
                    const blob = await fetch(event.target.result as string).then(r => r.blob());
                    resolveBlob(blob);
                  } catch (e) {
                    console.error("Error creating blob:", e);
                    resolveBlob(null);
                  }
                } else {
                  resolveBlob(null);
                }
              };
              reader.onerror = () => resolveBlob(null);
              reader.readAsDataURL(originalImageFileRef.current as File);
            });
          }
          
          if (!imageBlob || !maskBlob) {
            throw new Error("Failed to create image or mask blob");
          }
          
          // Save the current image for undo
          if (imageBlob) {
            const previousImageBlob = imageBlob.slice(0);
            historyStackRef.current.push({
              type: 'inpainting',
              data: {
                imageBlob: previousImageBlob,
                dimensions: {...originalDimensions}
              }
            });
          }
          
          // Create form data for the API request
          const formData = new FormData();
          formData.append('image', imageBlob, 'image.png');
          formData.append('mask', maskBlob, 'mask.png');
          
          // Call the inpainting API
          const response = await fetch(`${API_URL}/inpaint`, {
            method: 'POST',
            body: formData
          });
          
          if (!response.ok) {
            throw new Error(`Inpainting failed with status ${response.status}`);
          }
          
          const data = await response.json();
          
          if (!data.success) {
            throw new Error(data.message || "Inpainting API returned failure");
          }
          
          // Load the inpainted image
          const inpaintedImageUrl = `data:image/${data.format || 'png'};base64,${data.image}`;
          const inpaintedImg = new Image();
          
          await new Promise<void>((resolve, reject) => {
            inpaintedImg.onload = () => resolve();
            inpaintedImg.onerror = (e) => reject(e);
            inpaintedImg.src = inpaintedImageUrl;
          });
          
          // Store the new dimensions
          originalImageDimensionsRef.current = {
            width: inpaintedImg.width,
            height: inpaintedImg.height
          };
          
          // Convert to blob for future use
          const inpaintedBlob = await fetch(inpaintedImageUrl).then(r => r.blob());
          currentImageBlobRef.current = inpaintedBlob;
          
          // Save current canvas objects except background image and mask paths
          const objectsToPreserve = canvas.getObjects().filter(obj => 
            !(obj instanceof FabricImage) && // Not a background image
            !(obj.type === 'path') // Not a mask path
          );
          
          // Clear the canvas
          canvas.clear();
          
          // Add the new image to the canvas first (will be at the bottom of the stack)
          const fabricImg = new FabricImage(inpaintedImg);
          
          // Calculate scaling to fit in canvas
          const canvasContainerWidth = canvas.getWidth();
          const canvasContainerHeight = canvas.getHeight();
          const scaleFactor = Math.min(
            canvasContainerWidth / inpaintedImg.width,
            canvasContainerHeight / inpaintedImg.height
          ) * 0.95; // 95% to leave some margin
          
          fabricImg.scale(scaleFactor);
          
          // Add image to canvas
          canvas.add(fabricImg);
          canvas.centerObject(fabricImg);
          
          // Make the image non-interactive
          fabricImg.selectable = false;
          fabricImg.evented = false;
          
          // Restore previously saved objects (they will be on top of the background)
          objectsToPreserve.forEach(obj => {
            canvas.add(obj);
          });
          
          // Create and add the translated text
          const fontSize = translation.textStyle?.fontSize || 
            Math.min(Math.max(10, canvasWidth * 0.05), Math.min(canvasWidth * 0.2, canvasHeight * 0.2));
          
          // Use Textbox instead of Text for better text wrapping
          const text = new Textbox(translation.translated, {
            left: canvasLeft,
            top: canvasTop,
            width: canvasWidth,
            fontSize: fontSize,
            fontFamily: translation.textStyle?.fontFamily || 'SF Toontime',
            fill: translation.textStyle?.color || 'black',
            textAlign: 'center',
            originX: 'left', // Changed to left for proper width alignment
            originY: 'top',  // Changed to top for proper height alignment
            selectable: true,
            hasControls: true,
            lockScalingX: false,
            lockScalingY: false,
            splitByGrapheme: false,
            editable: true  // Allow editing
          });
          
          // Store relative position data on the text for resizing and positioning
          text.set({ 
            relativePosition: {
              leftRatio: translation.bounds.left / originalDimensions.width,
              topRatio: translation.bounds.top / originalDimensions.height,
              widthRatio: translation.bounds.width / originalDimensions.width,
              heightRatio: translation.bounds.height / originalDimensions.height,
              fontSizeRatio: fontSize / canvasWidth, // Relative to width for consistent sizing
              originalFontSize: fontSize // Store the original font size
            }
          });
          
          // Add the text to the canvas
          canvas.add(text);
          
          // Add to history stack for undo
          historyStackRef.current.push({
            type: 'selection',
            data: {
              fabricObject: text
            }
          });
          
          // Render the canvas with all updates
          canvas.renderAll();
          
          // Update status message
          setLoadingStatus("Text added successfully");
          setTimeout(() => {
            setLoadingStatus((currentStatus) => {
              if (currentStatus === "Text added successfully" || currentStatus === "Inpainting text area...") {
                return "";
              }
              return currentStatus;
            });
          }, 1500);
          
          // Clean up
          URL.revokeObjectURL(inpaintedImageUrl);
        } catch (error) {
          console.error("Inpainting failed:", error);
          setLoadingStatus("Inpainting failed. Using white rectangle instead.");
          
          // Add a fixed white rectangle to cover the original text
          const whiteRect = new Rect({
            left: canvasLeft,
            top: canvasTop,
            width: canvasWidth,
            height: canvasHeight,
            fill: 'white',
            selectable: false,
            evented: false,
          });
          
          // Add the white rectangle
          canvas.add(whiteRect);
          
          // Create a text object for the translated text
          const fontSize = translation.textStyle?.fontSize || 
            Math.min(Math.max(10, canvasWidth * 0.05), Math.min(canvasWidth * 0.2, canvasHeight * 0.2));
          
          // Use Textbox instead of Text for better text wrapping
          const text = new Textbox(translation.translated, {
            left: canvasLeft,
            top: canvasTop,
            width: canvasWidth,
            fontSize: fontSize,
            fontFamily: translation.textStyle?.fontFamily || 'SF Toontime',
            fill: translation.textStyle?.color || 'black',
            textAlign: 'center',
            originX: 'left', // Changed to left for proper width alignment
            originY: 'top',  // Changed to top for proper height alignment
            selectable: true,
            hasControls: true,
            lockScalingX: false,
            lockScalingY: false,
            splitByGrapheme: false,
            editable: true  // Allow editing
          });
          
          // Store relative position data on the text for resizing and positioning
          text.set({ 
            relativePosition: {
              leftRatio: translation.bounds.left / originalDimensions.width,
              topRatio: translation.bounds.top / originalDimensions.height,
              widthRatio: translation.bounds.width / originalDimensions.width,
              heightRatio: translation.bounds.height / originalDimensions.height,
              fontSizeRatio: fontSize / canvasWidth, // Relative to width for consistent sizing
              originalFontSize: fontSize // Store the original font size
            }
          });
          
          // Add the text to the canvas
          canvas.add(text);
          
          // Add to history stack for undo - Group rectangle and text together
          historyStackRef.current.push({
            type: 'selection',
            data: {
              fabricObject: text,
              backgroundRect: whiteRect
            }
          });
          
          // Update selection state
          setLoadingStatus("Text added successfully");
          setTimeout(() => setLoadingStatus(""), 1500);
        } finally {
          // Reset inpainting state
          setIsInpainting(false);
          isInpaintingRef.current = false;
        }
      } else {
        // Add a fixed white rectangle to cover the original text
        const whiteRect = new Rect({
          left: canvasLeft,
          top: canvasTop,
          width: canvasWidth,
          height: canvasHeight,
          fill: 'white',
          selectable: false,
          evented: false,
        });
        
        // Add the white rectangle
        canvas.add(whiteRect);
        
        // Create a text object for the translated text
        const fontSize = translation.textStyle?.fontSize || 
          Math.min(Math.max(10, canvasWidth * 0.05), Math.min(canvasWidth * 0.2, canvasHeight * 0.2));
        
        // Use Textbox instead of Text for better text wrapping
        const text = new Textbox(translation.translated, {
          left: canvasLeft,
          top: canvasTop,
          width: canvasWidth,
          fontSize: fontSize,
          fontFamily: translation.textStyle?.fontFamily || 'SF Toontime',
          fill: translation.textStyle?.color || 'black',
          textAlign: 'center',
          originX: 'left', // Changed to left for proper width alignment
          originY: 'top',  // Changed to top for proper height alignment
          selectable: true,
          hasControls: true,
          lockScalingX: false,
          lockScalingY: false,
          splitByGrapheme: false,
          editable: true  // Allow editing
        });
        
        // Store relative position data on the text for resizing and positioning
        text.set({ 
          relativePosition: {
            leftRatio: translation.bounds.left / originalDimensions.width,
            topRatio: translation.bounds.top / originalDimensions.height,
            widthRatio: translation.bounds.width / originalDimensions.width,
            heightRatio: translation.bounds.height / originalDimensions.height,
            fontSizeRatio: fontSize / canvasWidth, // Relative to width for consistent sizing
            originalFontSize: fontSize // Store the original font size
          }
        });
        
        // Add the text to the canvas
        canvas.add(text);
        
        // Add to history stack for undo - Group rectangle and text together
        historyStackRef.current.push({
          type: 'selection',
          data: {
            fabricObject: text,
            backgroundRect: whiteRect
          }
        });
        
        // Update selection state
        setLoadingStatus("Text added successfully");
        setTimeout(() => setLoadingStatus(""), 1500);
      }
    } catch (error) {
      console.error("Error adding text to canvas:", error);
      setLoadingStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setTimeout(() => setLoadingStatus(""), 1500);
    }
  };
  
  // Function to highlight a selection by ID
  const highlightSelectionById = (id: string | null) => {
    if (!fabricCanvasRef.current) return;
    
    const canvas = fabricCanvasRef.current;
    
    // Reset all selections to default appearance
    selectionsRef.current.forEach(selection => {
      selection.fabricObject.set({
        stroke: 'rgba(78, 13, 158, 0.8)',
        strokeWidth: 2,
        fill: 'rgba(78, 13, 158, 0.1)'
      });
    });
    
    // If an ID is provided, highlight that selection
    if (id) {
      const selectionToHighlight = selectionsRef.current.find(s => s.id === id);
      if (selectionToHighlight) {
        selectionToHighlight.fabricObject.set({
          stroke: 'rgba(234, 88, 12, 0.8)',
          strokeWidth: 3,
          fill: 'rgba(234, 88, 12, 0.2)'
        });
      }
    }
    
    canvas.renderAll();
  };
  
  // Function to clear all selections
  const clearAllSelections = () => {
    if (!fabricCanvasRef.current) return;
    
    const canvas = fabricCanvasRef.current;
    
    // Remove all selection rectangles from canvas
    selectionsRef.current.forEach(selection => {
      canvas.remove(selection.fabricObject);
    });
    
    // Also remove selection rectangles from history stack
    // Filter out any history items that are selection rectangles
    historyStackRef.current = historyStackRef.current.filter(item => {
      return !(item.type === 'selection' && 
               item.data && 
               typeof item.data === 'object' && 
               item.data.isSelectionRect);
    });
    
    // Clear selections array
    selectionsRef.current = [];
    selectionCounterRef.current = 0;
    
    canvas.renderAll();
    
    // Notify parent component about selections change
    if (onSelectionsChange) {
      onSelectionsChange(false);
    }
  };
  
  // Function to handle selection mode mouse down
  const handleSelectionStart = (options: any) => {
    if (tool !== 'selection') return;
    
    // Get pointer coordinates
    const pointer = fabricCanvasRef.current?.getPointer(options.e);
    if (!pointer) return;
    
    // Store starting point
    startPointRef.current = { x: pointer.x, y: pointer.y };
    
    // Create a new rectangle
    const rect = new Rect({
      left: pointer.x,
      top: pointer.y,
      width: 0,
      height: 0,
      strokeWidth: 2,
      stroke: 'rgba(78, 13, 158, 0.8)',
      fill: 'rgba(78, 13, 158, 0.1)',
      selectable: false,  // Make it non-selectable/draggable
      evented: false,     // Make it non-interactive
      hasControls: false, // Remove resize controls
      hasBorders: false   // Remove borders
    });
    
    // Mark this as a selection rectangle
    rect.set({ isSelection: true });
    
    // Add to canvas
    fabricCanvasRef.current?.add(rect);
    
    // Store current selection being drawn
    currentSelectionRef.current = rect;
  };
  
  // Function to handle selection mode mouse move
  const handleSelectionMove = (options: any) => {
    if (tool !== 'selection' || !startPointRef.current || !currentSelectionRef.current) return;
    
    // Get pointer coordinates
    const pointer = fabricCanvasRef.current?.getPointer(options.e);
    if (!pointer) return;
    
    // Calculate width and height
    const width = Math.abs(pointer.x - startPointRef.current.x);
    const height = Math.abs(pointer.y - startPointRef.current.y);
    
    // Adjust left and top if needed
    const left = pointer.x < startPointRef.current.x ? pointer.x : startPointRef.current.x;
    const top = pointer.y < startPointRef.current.y ? pointer.y : startPointRef.current.y;
    
    // Update rectangle
    currentSelectionRef.current.set({
      left: left,
      top: top,
      width: width,
      height: height
    });
    
    fabricCanvasRef.current?.renderAll();
  };
  
  // Function to handle selection mode mouse up
  const handleSelectionEnd = () => {
    if (tool !== 'selection' || !currentSelectionRef.current || !startPointRef.current) return;
    
    // Get the rectangle
    const rect = currentSelectionRef.current;
    
    // Ensure rectangle remains non-interactive
    rect.set({
      selectable: false,
      evented: false,
      hasControls: false,
      hasBorders: false
    });
    
    // Only add if the rectangle has some size
    if (rect.width! > 5 && rect.height! > 5) {
      // Increment selection counter
      selectionCounterRef.current += 1;
      
      // Create a selection object
      const selection = {
        id: selectionCounterRef.current.toString(),
        fabricObject: rect,
        bounds: {
          left: rect.left!,
          top: rect.top!,
          width: rect.width!,
          height: rect.height!
        }
      };
      
      // Add to selections array
      selectionsRef.current.push(selection);
      
      // Add to history stack for proper undo order
      historyStackRef.current.push({
        type: 'selection',
        data: {
          fabricObject: rect,
          isSelectionRect: true,
          selectionId: selection.id
        }
      });
      
      // Notify parent component about selections change
      if (onSelectionsChange) {
        onSelectionsChange(true);
      }
    } else {
      // Remove the rectangle if it's too small
      fabricCanvasRef.current?.remove(rect);
    }
    
    // Reset current selection and start point
    currentSelectionRef.current = null;
    startPointRef.current = null;
  };
  
  // Function to undo the last action
  const undoLastAction = () => {
    if (!fabricCanvasRef.current) return;
    
    const canvas = fabricCanvasRef.current;
    
    // If no history, nothing to undo
    if (historyStackRef.current.length === 0) {
      setLoadingStatus("Nothing to undo");
      setTimeout(() => {
        if (loadingStatus === "Nothing to undo") {
          setLoadingStatus("");
        }
      }, 1500);
      return;
    }
    
    // Get the last object from the history stack
    const lastAction = historyStackRef.current.pop();
    
    // Handle different types of actions
    if (lastAction && typeof lastAction === 'object' && 'type' in lastAction) {
      // This is a typed action object
      if (lastAction.type === 'inpainting') {
        // Handle inpainting undo
        handleInpaintingUndo(lastAction.data);
        return;
      } else if (lastAction.type === 'path') {
        // Handle path undo
        const objects = canvas.getObjects();
        for (let i = 0; i < objects.length; i++) {
          if (objects[i] === lastAction.data) {
            // Remove found object from canvas
            canvas.remove(objects[i]);
            canvas.renderAll();
            break;
          }
        }
        
        setLoadingStatus("Undone drawing");
        setTimeout(() => {
          if (loadingStatus === "Undone drawing") {
            setLoadingStatus("");
          }
        }, 1500);
        return;
      } else if (lastAction.type === 'selection') {
        // Handle text selection undo
        const data = lastAction.data;

        // Remove the fabric object
        if (data && typeof data === 'object') {
          // Check if this is a selection rectangle
          if (data.isSelectionRect) {
            // Remove the selection rectangle from canvas
            canvas.remove(data.fabricObject);
            
            // Also remove from selections array
            if (data.selectionId) {
              const selectionIndex = selectionsRef.current.findIndex(s => s.id === data.selectionId);
              if (selectionIndex !== -1) {
                selectionsRef.current.splice(selectionIndex, 1);
                
                // Update has selections state
                if (onSelectionsChange) {
                  onSelectionsChange(selectionsRef.current.length > 0);
                }
              }
            }
            
            setLoadingStatus("Selection undone");
            setTimeout(() => {
              if (loadingStatus === "Selection undone") {
                setLoadingStatus("");
              }
            }, 1500);
          } else {
            // Remove the text object
            if ('fabricObject' in data) {
              canvas.remove(data.fabricObject);
              
              // If this was the selected text, clear the selection
              if (selectedTextRef.current === data.fabricObject) {
                selectedTextRef.current = null;
                handleTextSelectionChange(false);
              }
            }
            
            // Remove the background rectangle if it exists
            if ('backgroundRect' in data && data.backgroundRect) {
              canvas.remove(data.backgroundRect);
            }
            
            setLoadingStatus("Undone text placement");
            setTimeout(() => {
              if (loadingStatus === "Undone text placement") {
                setLoadingStatus("");
              }
            }, 1500);
          }
        }

        canvas.renderAll();
        return;
      }
    }
    
    // Fallback for legacy history stack items (backward compatibility)
    // Find the object on the canvas and remove it
    const objects = canvas.getObjects();
    for (let i = 0; i < objects.length; i++) {
      if (objects[i] === lastAction) {
        // Remove found object from canvas
        canvas.remove(objects[i]);
        canvas.renderAll();
        break;
      }
    }
    
    setLoadingStatus("Undone last action");
    setTimeout(() => {
      if (loadingStatus === "Undone last action") {
        setLoadingStatus("");
      }
    }, 1500);
  };
  
  // Helper function to handle inpainting undo
  const handleInpaintingUndo = async (data: any) => {
    if (!fabricCanvasRef.current) return;
    
    try {
      setLoadingStatus("Restoring previous image...");
      
      const canvas = fabricCanvasRef.current;
      
      // Clear the canvas
      canvas.clear();
      
      if (!data || !data.imageBlob) {
        setLoadingStatus("No previous image data available");
        setTimeout(() => setLoadingStatus(""), 1500);
        return;
      }
      
      // Create a URL from the blob
      const imageUrl = URL.createObjectURL(data.imageBlob);
      
      // Create a new image element
      const img = new Image();
      img.src = imageUrl;
      
      img.onload = () => {
        if (!fabricCanvasRef.current) {
          URL.revokeObjectURL(imageUrl);
          return;
        }
        
        // Restore original dimensions
        if (data.dimensions) {
          originalImageDimensionsRef.current = data.dimensions;
        }
        
        // Create a fabric image from the original image
        const fabricImg = new FabricImage(img);
        
        // Get the canvas dimensions
        const canvasWidth = canvas.getWidth();
        const canvasHeight = canvas.getHeight();
        
        // Calculate scaling to fit the image in the canvas
        const scaleX = canvasWidth / img.width;
        const scaleY = canvasHeight / img.height;
        const scale = Math.min(scaleX, scaleY);
        
        fabricImg.scale(scale);
        
        // Center the image on the canvas
        canvas.centerObject(fabricImg);
        fabricImg.selectable = false;
        fabricImg.evented = false;
        
        // Add the image to the canvas
        canvas.add(fabricImg);
        canvas.renderAll();
        
        // Restore the current image blob reference
        currentImageBlobRef.current = data.imageBlob;
        
        setLoadingStatus("Previous image restored");
        setTimeout(() => setLoadingStatus(""), 1500);
        
        // Clean up the URL
        URL.revokeObjectURL(imageUrl);
      };
      
      img.onerror = () => {
        setLoadingStatus("Failed to restore previous image");
        setTimeout(() => setLoadingStatus(""), 1500);
        URL.revokeObjectURL(imageUrl);
      };
    } catch (error) {
      console.error("Error restoring previous image:", error);
      setLoadingStatus("Failed to restore previous image");
      setTimeout(() => setLoadingStatus(""), 1500);
    }
  };
  
  // Function to handle text selection changes
  const handleTextSelectionChange = (selected: boolean) => {
    // Call the callback if provided
    if (onTextSelectionRef.current) {
      onTextSelectionRef.current(selected);
    }
  };
  
  // Function to inpaint the image
  const inpaintImage = async (): Promise<void> => {
    return new Promise<void>(async (resolve, reject) => {
      const canvas = fabricCanvasRef.current;
      if (!canvas) {
        setLoadingStatus("Canvas not available for inpainting");
        reject(new Error("Canvas not available for inpainting"));
        return;
      }
      
      try {
        // Save the current image state before inpainting
        let previousImageBlob: Blob | null = null;
        let previousDimensions = originalImageDimensionsRef.current;
        
        // Create a copy of the current image blob if available
        if (currentImageBlobRef.current) {
          previousImageBlob = currentImageBlobRef.current.slice(0);
        } else if (originalImageFileRef.current) {
          // Convert the original file to blob if we don't have a current image blob
          const reader = new FileReader();
          previousImageBlob = await new Promise<Blob | null>((resolveBlob) => {
            reader.onload = async (event) => {
              if (event.target?.result) {
                const blob = await fetch(event.target.result as string).then(r => r.blob());
                resolveBlob(blob);
              } else {
                resolveBlob(null);
              }
            };
            reader.onerror = () => resolveBlob(null);
            reader.readAsDataURL(originalImageFileRef.current!);
          });
        }
        
        // If we have a previous image state, add it to the history stack
        if (previousImageBlob) {
          historyStackRef.current.push({
            type: 'inpainting',
            data: {
              imageBlob: previousImageBlob,
              dimensions: previousDimensions
            }
          });
        }
        
        setIsInpainting(true);
        isInpaintingRef.current = true;
        setLoadingStatus("Processing inpainting...");
        
        // Save current zoom and viewport transform
        const currentZoom = canvas.getZoom();
        const originalVpt = [...canvas.viewportTransform || [1, 0, 0, 1, 0, 0]];
        
        // Temporarily reset zoom for accurate export
        canvas.setZoom(1);
        canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
        
        // Get the original dimensions of the image
        const originalDimensions = originalImageDimensionsRef.current;
        if (!originalDimensions) {
          setLoadingStatus("Original image dimensions not available");
          setIsInpainting(false);
          isInpaintingRef.current = false;
          reject(new Error("Original image dimensions not available"));
          return;
        }
        
        // Create a new canvas with original image dimensions for the mask
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = originalDimensions.width;
        exportCanvas.height = originalDimensions.height;
        const exportCtx = exportCanvas.getContext('2d');
        
        if (!exportCtx) {
          setLoadingStatus("Failed to create export context");
          setIsInpainting(false);
          isInpaintingRef.current = false;
          reject(new Error("Failed to create export context"));
          return;
        }
        
        // Fill the canvas with black background
        exportCtx.fillStyle = '#000000';
        exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
        
        // Set all drawn content to white
        exportCtx.fillStyle = '#ffffff';
        exportCtx.strokeStyle = '#ffffff'; // Set stroke color to white
        
        // Calculate scale factors to map from canvas coordinates to original image coordinates
        const objects = canvas.getObjects();
        const backgroundImage = objects.find(obj => obj instanceof FabricImage);
        
        if (!backgroundImage || !(backgroundImage instanceof FabricImage)) {
          setLoadingStatus("Background image not found");
          setIsInpainting(false);
          isInpaintingRef.current = false;
          reject(new Error("Background image not found"));
          return;
        }
        
        // Get the background image scaling and dimensions
        const imgWidth = backgroundImage.width || 1;
        const imgHeight = backgroundImage.height || 1;
        const imgScaleX = (backgroundImage as any).scaleX || 1;
        const imgScaleY = (backgroundImage as any).scaleY || 1;
        const imgLeft = backgroundImage.left || 0;
        const imgTop = backgroundImage.top || 0;
        
        // Calculate scaling factors to map from canvas coordinates to original image dimensions
        const scaleX = originalDimensions.width / (imgWidth * imgScaleX);
        const scaleY = originalDimensions.height / (imgHeight * imgScaleY);
        
        // Filter out the background image, only keep path objects for the mask
        const pathObjects = objects.filter(obj => obj.type === 'path');
        
        // If no drawings, alert the user and exit
        if (pathObjects.length === 0) {
          setLoadingStatus("No mask drawn yet!");
          setTimeout(() => {
            if (loadingStatus && loadingStatus.includes("No mask")) {
              setLoadingStatus("");
            }
          }, 1500);
          setIsInpainting(false);
          isInpaintingRef.current = false;
          
          // Restore canvas zoom and transform
          canvas.setZoom(currentZoom);
          canvas.setViewportTransform(originalVpt);
          
          reject(new Error("No mask drawn yet"));
          return;
        }
        
        // Process each path object
        for (let i = 0; i < pathObjects.length; i++) {
          const obj = pathObjects[i];
          const path = obj.path;
          
          if (path) {
            // Start a new path on the export canvas
            exportCtx.beginPath();
            
            // Adjust the starting point
            // For path coordinates, we need to account for:
            // 1. Background image position offset
            // 2. Scaling from canvas coordinates to original image coordinates
            const startPoint = path[0];
            if (startPoint && startPoint.length >= 3) {
              const adjustedX = (startPoint[1] - imgLeft) * scaleX;
              const adjustedY = (startPoint[2] - imgTop) * scaleY;
              exportCtx.moveTo(adjustedX, adjustedY);
              
              // Draw the path according to its type
              for (let j = 1; j < path.length; j++) {
                const p = path[j];
                
                if (p[0] === 'L') {
                  // Line to
                  const lineX = (p[1] - imgLeft) * scaleX;
                  const lineY = (p[2] - imgTop) * scaleY;
                  exportCtx.lineTo(lineX, lineY);
                } else if (p[0] === 'Q') {
                  // Quadratic curve
                  const cpX = (p[1] - imgLeft) * scaleX;
                  const cpY = (p[2] - imgTop) * scaleY;
                  const endX = (p[3] - imgLeft) * scaleX;
                  const endY = (p[4] - imgTop) * scaleY;
                  exportCtx.quadraticCurveTo(cpX, cpY, endX, endY);
                } else if (p[0] === 'C') {
                  // Bezier curve
                  const cp1X = (p[1] - imgLeft) * scaleX;
                  const cp1Y = (p[2] - imgTop) * scaleY;
                  const cp2X = (p[3] - imgLeft) * scaleX;
                  const cp2Y = (p[4] - imgTop) * scaleY;
                  const endX = (p[5] - imgLeft) * scaleX;
                  const endY = (p[6] - imgTop) * scaleY;
                  exportCtx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, endX, endY);
                }
              }
            }
            
            // Set line properties and apply stroke
            // Convert the brush size to the original image scale
            exportCtx.lineWidth = (obj.strokeWidth || 1) * scaleX;
            exportCtx.lineCap = 'round';
            exportCtx.lineJoin = 'round';
            exportCtx.stroke(); // Actually draw the white path
          }
        }
        
        // Restore canvas zoom and transform
        canvas.setZoom(currentZoom);
        canvas.setViewportTransform(originalVpt);
        
        // Convert canvas to data URL and log for debugging
        const maskDataUrl = exportCanvas.toDataURL('image/png');
        
        // For debugging purposes
        console.log('Generated mask with dimensions:', exportCanvas.width, 'x', exportCanvas.height);
        
        // Convert data URL to blob
        const maskBlob = await fetch(maskDataUrl).then(r => r.blob());
        
        // Prepare form data for API request
        const formData = new FormData();
        
        // Use the current inpainted image if available, otherwise use the original image
        if (currentImageBlobRef.current) {
          formData.append('image', currentImageBlobRef.current, 'current_image.png');
        } else if (originalImageFileRef.current) {
          formData.append('image', originalImageFileRef.current);
        } else {
          setLoadingStatus("No image available for inpainting");
          setIsInpainting(false);
          isInpaintingRef.current = false;
          reject(new Error("No image available for inpainting"));
          return;
        }
        
        formData.append('mask', maskBlob, 'mask.png');
        
        // Send to inpainting API
        try {
          setLoadingStatus("Sending to API...");
          
          const response = await fetch(`${API_URL}/inpaint`, {
            method: 'POST',
            body: formData,
          });
          
          if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
          }
          
          const data = await response.json();
          
          if (!data.success) {
            throw new Error(data.message || "API returned failure");
          }
          
          setLoadingStatus("Processing response...");
          
          // Convert the base64 image data to a URL
          const inpaintedImageUrl = `data:image/${data.format || 'png'};base64,${data.image}`;
          
          // Convert to blob for future use
          const inpaintedImageBlob = await fetch(inpaintedImageUrl).then(r => r.blob());
          currentImageBlobRef.current = inpaintedImageBlob;
          
          // Create a new image element to load the inpainted image
          const img = new Image();
          img.src = inpaintedImageUrl;
          
          img.onload = () => {
            if (!fabricCanvasRef.current) {
              setLoadingStatus("Canvas not available");
              setIsInpainting(false);
              isInpaintingRef.current = false;
              reject(new Error("Canvas not available"));
              return;
            }
            
            const canvas = fabricCanvasRef.current;
            
            // Store the new dimensions
            originalImageDimensionsRef.current = {
              width: img.width,
              height: img.height
            };
            
            // Save current canvas objects except background image and mask paths
            const objectsToPreserve = canvas.getObjects().filter(obj => 
              !(obj instanceof FabricImage) && // Not a background image
              !(obj.type === 'path') // Not a mask path
            );
            
            // Clear the canvas
            canvas.clear();
            
            // Create a Fabric image from the inpainted image
            const fabricImg = new FabricImage(img);
            
            // Calculate scaling to fit in canvas
            const canvasContainerWidth = canvas.getWidth();
            const canvasContainerHeight = canvas.getHeight();
            const scaleFactor = Math.min(
              canvasContainerWidth / img.width,
              canvasContainerHeight / img.height
            ) * 0.95; // 95% to leave some margin
            
            fabricImg.scale(scaleFactor);
            
            // Add image to canvas
            canvas.add(fabricImg);
            canvas.centerObject(fabricImg);
            
            // Make the image non-interactive
            fabricImg.selectable = false;
            fabricImg.evented = false;
            
            // Restore previously saved objects (they will be on top of the background)
            objectsToPreserve.forEach(obj => {
              canvas.add(obj);
            });
            
            canvas.renderAll();
            
            setLoadingStatus("Inpainting complete");
            setIsInpainting(false);
            isInpaintingRef.current = false;
            
            // Clear the message after a brief delay
            setTimeout(() => {
              setLoadingStatus((currentStatus) => {
                if (currentStatus === "Inpainting complete") {
                  return "";
                }
                return currentStatus;
              });
            }, 1500);
            
            // Clean up the URL
            URL.revokeObjectURL(inpaintedImageUrl);
            
            resolve();
          };
          
          img.onerror = (err) => {
            console.error("Error loading inpainted image:", err);
            setLoadingStatus("Failed to load inpainted image");
            setIsInpainting(false);
            isInpaintingRef.current = false;
            
            // Clear error message after a brief delay
            setTimeout(() => {
              setLoadingStatus((currentStatus) => {
                if (currentStatus === "Failed to load inpainted image") {
                  return "";
                }
                return currentStatus;
              });
            }, 3000);
            
            reject(new Error("Failed to load inpainted image"));
          };
        } catch (error: any) {
          const errorMessage = `Inpainting failed: ${error.message || 'Unknown error'}`;
          setLoadingStatus(errorMessage);
          setIsInpainting(false);
          isInpaintingRef.current = false;
          
          // Clear error message after a brief delay
          setTimeout(() => {
            setLoadingStatus((currentStatus) => {
              if (currentStatus === errorMessage) {
                return "";
              }
              return currentStatus;
            });
          }, 3000);
          
          reject(error);
        }
      } catch (error: any) {
        const errorMessage = `Inpainting failed: ${error.message || 'Unknown error'}`;
        setLoadingStatus(errorMessage);
        setIsInpainting(false);
        isInpaintingRef.current = false;
        
        // Clear error message after a brief delay
        setTimeout(() => {
          setLoadingStatus((currentStatus) => {
            if (currentStatus === errorMessage) {
              return "";
            }
            return currentStatus;
          });
        }, 3000);
        
        reject(error);
      }
    });
  };
  
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
          stroke="rgba(236, 72, 153, 0.8)"
          stroke-width="1"
          fill="none"
        />
      </svg>
    `;
    
    // Convert the SVG to a data URL
    const svgBlob = new Blob([circle], {type: 'image/svg+xml'});
    const url = URL.createObjectURL(svgBlob);
    
    // Apply the cursor to the container
    containerRef.current.style.cursor = `url('${url}') ${zoomedSize / 2} ${zoomedSize / 2}, auto`;
    
    // Clean up the URL after a longer delay to ensure it's fully loaded
    setTimeout(() => URL.revokeObjectURL(url), 300);
  };
  
  // Function to update the brush size
  const updateBrushSize = (newSize: number) => {
    if (!fabricCanvasRef.current) return;
    
    // Clamp size between 5 and 50
    const clampedSize = Math.max(5, Math.min(newSize, 50));
    brushSizeRef.current = clampedSize;
    
    // Update the brush size in Fabric
    const canvas = fabricCanvasRef.current;
    const brush = canvas.freeDrawingBrush;
    brush.width = clampedSize;
    
    // Update cursor
    updateBrushCursor(clampedSize);
    
    // Show feedback
    setLoadingStatus(`Brush: ${clampedSize}px`);
    setTimeout(() => {
      if (loadingStatus.includes("Brush")) {
        setLoadingStatus("");
      }
    }, 1000);
  };
  
  // Zoom canvas functionality
  const zoomCanvas = (delta: number, x: number, y: number) => {
    if (!fabricCanvasRef.current) return;
    
    const canvas = fabricCanvasRef.current;
    
    // Get pointer position relative to canvas
    const pointer = canvas.getPointer({ clientX: x, clientY: y });
    
    // More granular zoom increments for smoother zooming
    const zoomFactor = delta > 0 ? 0.95 : 1.05;
    
    // Calculate new zoom level
    let newZoom = zoomRef.current * zoomFactor;
    
    // Clamp zoom level between 0.5 and 4
    newZoom = Math.max(0.5, Math.min(newZoom, 4));
    
    // Don't do anything if we're already at the limit
    if (newZoom === zoomRef.current) return;
    
    // Apply zoom with Fabric's zoomToPoint
    canvas.zoomToPoint({ x: pointer.x, y: pointer.y }, newZoom);
    
    // Update zoom reference
    zoomRef.current = newZoom;
    
    // Update text positions after zooming
    updateTextElementPositions();
    
    // Display feedback
    setLoadingStatus(`Zoom: ${Math.round(newZoom * 100)}%`);
    setTimeout(() => {
      if (loadingStatus && loadingStatus.includes("Zoom")) {
        setLoadingStatus("");
      }
    }, 1000);
    
    // Update cursor for the brush if in mask mode
    if (tool === 'mask') {
      updateBrushCursor(brushSizeRef.current);
    }
  };
  
  // Reset zoom to 1
  const resetZoom = () => {
    if (!fabricCanvasRef.current) return;
    
    const canvas = fabricCanvasRef.current;
    
    // Reset zoom to 1 (100%)
    canvas.setZoom(1);
    
    // Reset pan to center
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    
    // Update zoom reference
    zoomRef.current = 1;
    
    // Reset any accumulated pan values
    panPositionRef.current = { x: 0, y: 0 };
    
    // Update text positions
    updateTextElementPositions();
    
    // Show feedback
    setLoadingStatus("Zoom reset to 100%");
    setTimeout(() => {
      if (loadingStatus && loadingStatus.includes("Zoom")) {
        setLoadingStatus("");
      }
    }, 1000);
    
    // Update cursor for the brush if in mask mode
    if (tool === 'mask') {
      updateBrushCursor(brushSizeRef.current);
    }
  };
  
  // Initialize the canvas when component mounts
  useEffect(() => {
    if (!canvasRef.current) return;
    
    // If a Fabric canvas instance already exists, dispose it
    if (fabricCanvasRef.current) {
      fabricCanvasRef.current.dispose();
      fabricCanvasRef.current = null;
    }
    
    // Get container dimensions for initial setup
    const containerWidth = containerRef.current?.clientWidth || window.innerWidth * 0.9;
    const containerHeight = containerRef.current?.clientHeight || window.innerHeight * 0.8;
    
    setLoadingStatus("Initializing canvas...");
    
    // Create a new Fabric canvas
    const fabricCanvas = new Canvas(canvasRef.current, {
      isDrawingMode: tool === 'mask',
      backgroundColor: '#f5f5f5',
      width: containerWidth,
      height: containerHeight,
      selection: false, // Disable selection to prevent accidental selection
      preserveObjectStacking: true, // Maintain stacking order
      fireRightClick: false, // Don't fire right click
      stopContextMenu: true // Prevent context menu
    });
    
    fabricCanvasRef.current = fabricCanvas;
    
    // Configure brush
    const pencilBrush = new PencilBrush(fabricCanvas);
    pencilBrush.color = 'rgba(236, 72, 153, 0.5)'; // Pink color (#EC4899) with transparency
    pencilBrush.width = brushSizeRef.current;
    fabricCanvas.freeDrawingBrush = pencilBrush;
    
    // Initialize cursor if in mask mode
    if (tool === 'mask') {
      updateBrushCursor(brushSizeRef.current);
    }
    
    // Handle path created event for undo history
    fabricCanvas.on('path:created', (e: any) => {
      // Only add to history if not currently inpainting
      if (!isInpaintingRef.current) {
        const path = e.path;
        
        // Make path non-selectable and non-interactive
        path.set({
          selectable: false,
          evented: false,
          hasControls: false,
          hasBorders: false
        });
        
        historyStackRef.current.push({
          type: 'path',
          data: path
        });
      }
    });
    
    // Set loading status to indicate canvas is ready
    setLoadingStatus("Canvas initialized");
    setTimeout(() => setLoadingStatus(""), 1500);
    
  }, []); // Run only once when component mounts
  
  // Update canvas settings when tool changes
  useEffect(() => {
    if (!fabricCanvasRef.current) return;
    
    const canvas = fabricCanvasRef.current;
    
    // Update drawing mode based on current tool
    canvas.isDrawingMode = tool === 'mask' && !isInpainting;
    
    // Enable selection for pointer tool only, disable for all other tools
    canvas.selection = tool === 'pointer' && !isInpainting;
    
    // Update cursor for the correct tool
    if (tool === 'mask' && !isInpainting) {
      // Configure brush
      if (canvas.freeDrawingBrush) {
        canvas.freeDrawingBrush.color = 'rgba(236, 72, 153, 0.5)'; // Pink color (#EC4899) with transparency
        canvas.freeDrawingBrush.width = brushSizeRef.current;
      }
      updateBrushCursor(brushSizeRef.current);
    } else if (tool === 'selection' && !isInpainting) {
      if (containerRef.current) {
        containerRef.current.style.cursor = 'crosshair';
      }
    } else if (tool === 'pointer' && !isInpainting) {
      if (containerRef.current) {
        containerRef.current.style.cursor = 'default';
      }
    } else {
      if (containerRef.current) {
        containerRef.current.style.cursor = isInpainting ? 'wait' : 'default';
      }
    }
    
  }, [tool, isInpainting]); // Run when tool changes or inpainting state changes
  
  // Handle image changes in a separate effect
  useEffect(() => {
    if (!fabricCanvasRef.current || !image) return;
    
    setLoadingStatus("Loading image...");
    
    // Load the image into the canvas
    const imageUrl = URL.createObjectURL(image);
    
    const htmlImg = new Image();
    htmlImg.src = imageUrl;
    
    htmlImg.onload = () => {
      if (!fabricCanvasRef.current || !containerRef.current) {
        setLoadingStatus("Canvas not available");
        URL.revokeObjectURL(imageUrl);
        return;
      }
      
      const canvas = fabricCanvasRef.current;
      
      // Store original dimensions
      originalImageDimensionsRef.current = {
        width: htmlImg.width,
        height: htmlImg.height,
      };
      
      // Store the original image URL
      originalImageDataRef.current = imageUrl;
      
      // Clear the canvas of any existing content
      canvas.clear();
      
      // Create a fabric image
      const fabricImg = new FabricImage(htmlImg);
      
      // Calculate container dimensions
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;
      
      // Set canvas dimensions
      canvas.setWidth(containerWidth);
      canvas.setHeight(containerHeight);
      
      // Calculate scaling to fit the image in the canvas
      const scaleX = containerWidth / htmlImg.width;
      const scaleY = containerHeight / htmlImg.height;
      const scale = Math.min(scaleX, scaleY) * 0.95; // Use 95% to leave some margin
      
      // Get image dimensions
      const imgWidth = htmlImg.width;
      const imgHeight = htmlImg.height;
      
      setLoadingStatus(`Image: ${imgWidth}x${imgHeight}`);
      
      // Calculate the scaled dimensions
      const scaledWidth = Math.round(imgWidth * scale);
      const scaledHeight = Math.round(imgHeight * scale);
      
      setLoadingStatus(`Scaled dimensions: ${scaledWidth}x${scaledHeight}`);
      
      fabricImg.scale(scale);
      
      // Center the image on the canvas
      canvas.add(fabricImg);
      canvas.centerObject(fabricImg);
      
      // Make the image non-interactive
      fabricImg.selectable = false;
      fabricImg.evented = false;
      
      // Clear the history stack when adding a new image
      historyStackRef.current = [];
      
      // Reset zoom level
      zoomRef.current = 1;
      canvas.setZoom(1);
      canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
      
      // Re-initialize drawing mode if in mask mode
      if (tool === 'mask') {
        canvas.isDrawingMode = true;
        if (canvas.freeDrawingBrush) {
          canvas.freeDrawingBrush.color = 'rgba(236, 72, 153, 0.5)'; // Pink color (#EC4899) with transparency
          canvas.freeDrawingBrush.width = brushSizeRef.current;
          
          // Update cursor
          updateBrushCursor(brushSizeRef.current);
        }
      }
      
      canvas.renderAll();
      
      setLoadingStatus("Image loaded successfully");
      setTimeout(() => setLoadingStatus(""), 1500);
    };
    
    htmlImg.onerror = () => {
      setLoadingStatus("Failed to load image");
      URL.revokeObjectURL(imageUrl);
    };
    
    // Cleanup function
    return () => {
      URL.revokeObjectURL(imageUrl);
    };
  }, [image]);
  
  // Add event listeners for mouse and keyboard events
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      // Skip if inpainting is in progress
      if (isInpainting) return;
      
      // Prevent default behavior first to avoid page scrolling
      e.preventDefault();
      
      // Check if Ctrl key is pressed for zooming
      if (e.ctrlKey || e.metaKey) {
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
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if inpainting is in progress
      if (isInpainting) return;
      
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
      
      // Handle Ctrl+Z for undo
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        undoLastAction();
      }
      
      // Space key for panning
      if (e.code === 'Space') {
        if (containerRef.current) {
          containerRef.current.style.cursor = 'grab';
        }
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      // Skip if inpainting is in progress
      if (isInpainting) return;
      
      if (e.key === 'Control' || e.key === 'Meta') {
        setLoadingStatus('');
        if (!containerRef.current) return;
        
        if (tool === 'mask') {
          updateBrushCursor(brushSizeRef.current);
        } else {
          containerRef.current.style.cursor = 'default';
        }
      }
      
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
    
    // Add resize listener
    const handleResize = () => {
      if (!fabricCanvasRef.current || !containerRef.current) return;
      
      const canvas = fabricCanvasRef.current;
      const container = containerRef.current;
      
      // Get container dimensions
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      
      // Set canvas dimensions
      canvas.setWidth(containerWidth);
      canvas.setHeight(containerHeight);
      
      // Get all objects on the canvas
      const objects = canvas.getObjects();
      
      // If there's an image, rescale it
      const backgroundImage = objects.find(obj => obj instanceof FabricImage);
      
      if (backgroundImage && originalImageDimensionsRef.current) {
        const originalWidth = originalImageDimensionsRef.current.width;
        const originalHeight = originalImageDimensionsRef.current.height;
        
        // Calculate scaling to fit the image in the canvas
        const scaleX = containerWidth / originalWidth;
        const scaleY = containerHeight / originalHeight;
        const scale = Math.min(scaleX, scaleY) * 0.95; // Use 95% to leave some margin
        
        // Set image dimensions
        (backgroundImage as any).scaleX = scale;
        (backgroundImage as any).scaleY = scale;
        
        // Center the image
        canvas.centerObject(backgroundImage);
      }
      
      // Render the canvas
      canvas.renderAll();
      
      // Update text element positions
      updateTextElementPositions();
    };
    
    // Mouse event handlers for panning
    const handleMouseDown = (e: MouseEvent) => {
      // Skip if inpainting is in progress
      if (isInpainting) return;
      
      // Only allow panning with space bar held or middle mouse button
      if (e.button === 1 || (e.button === 0 && e.getModifierState('Space'))) {
        if (containerRef.current) {
          containerRef.current.style.cursor = 'grabbing';
        }
        isPanningRef.current = true;
        e.preventDefault();
        
        // Store initial pointer position
        if (fabricCanvasRef.current) {
          const canvas = fabricCanvasRef.current;
          const pointer = canvas.getPointer(e);
          panPositionRef.current = { x: pointer.x, y: pointer.y };
        }
      }
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      // Skip if inpainting is in progress
      if (isInpainting) return;
      
      const canvas = fabricCanvasRef.current;
      if (!canvas || !isPanningRef.current) return;
      
      // Pan the canvas based on mouse movement
      const delta = {
        x: e.movementX,
        y: e.movementY
      };
      
      // Get current viewport transform
      const vpt = [...(canvas.viewportTransform || [1, 0, 0, 1, 0, 0])];
      
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
      // Skip if inpainting is in progress
      if (isInpainting) return;
      
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
    
    const container = containerRef.current;
    if (container) {
      // Use passive: false to prevent browser warnings with preventDefault
      container.addEventListener('wheel', handleWheel, { passive: false });
      container.addEventListener('mousedown', handleMouseDown);
      container.addEventListener('mousemove', handleMouseMove);
      container.addEventListener('mouseup', handleMouseUp);
      container.addEventListener('mouseleave', handleMouseUp);
      
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('keyup', handleKeyUp);
    }
    
    window.addEventListener('resize', handleResize);
    
    // Return cleanup function
    return () => {
      if (container) {
        container.removeEventListener('wheel', handleWheel);
        container.removeEventListener('mousedown', handleMouseDown);
        container.removeEventListener('mousemove', handleMouseMove);
        container.removeEventListener('mouseup', handleMouseUp);
        container.removeEventListener('mouseleave', handleMouseUp);
      }
      
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('resize', handleResize);
    };
  }, [tool, isInpainting]);
  
  // Add an effect to force cursor inheritance in canvas elements
  useEffect(() => {
    // Create a style element
    const styleElement = document.createElement('style');
    styleElement.innerHTML = `
      canvas {
        cursor: inherit !important;
      }
    `;
    document.head.appendChild(styleElement);
    
    return () => {
      document.head.removeChild(styleElement);
    };
  }, []);
  
  // Add event handlers for fabric canvas
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    
    // Mouse down event handler for selection tool
    canvas.on('mouse:down', handleSelectionStart);
    
    // Mouse move event handler for selection tool
    canvas.on('mouse:move', handleSelectionMove);
    
    // Mouse up event handler for selection tool
    canvas.on('mouse:up', handleSelectionEnd);
    
    // Double-click handler for text editing
    const handleDoubleClick = (e: any) => {
      if (e.target && (e.target instanceof Textbox) && e.target.editable) {
        // Enter editing mode for the textbox
        e.target.enterEditing();
        canvas.setActiveObject(e.target);
      }
    };
    
    canvas.on('mouse:dblclick', handleDoubleClick);
    
    // Add canvas mouse:down event handler to track text selection
    const handleObjectSelected = (e: any) => {
      // Check if selected object is a text
      if (e.target && (e.target instanceof Text || e.target instanceof Textbox)) {
        // Store the text object in the ref
        selectedTextRef.current = e.target;
        // Notify the parent component that a text is selected
        handleTextSelectionChange(true);
      } else {
        // If it's not a text object and we had a text selected previously, clear selection
        if (selectedTextRef.current) {
          selectedTextRef.current = null;
          handleTextSelectionChange(false);
        }
      }
    };
    
    canvas.on('selection:created', handleObjectSelected);
    canvas.on('selection:updated', handleObjectSelected);
    canvas.on('selection:cleared', () => {
      if (selectedTextRef.current) {
        selectedTextRef.current = null;
        handleTextSelectionChange(false);
      }
    });
    
    return () => {
      canvas.off('mouse:down', handleSelectionStart);
      canvas.off('mouse:move', handleSelectionMove);
      canvas.off('mouse:up', handleSelectionEnd);
      canvas.off('mouse:dblclick', handleDoubleClick);
      canvas.off('selection:created', handleObjectSelected);
      canvas.off('selection:updated', handleObjectSelected);
      canvas.off('selection:cleared', () => {});
    };
  }, [tool]);
  
  // Update the updateTextElementPositions function
  const updateTextElementPositions = () => {
    if (!fabricCanvasRef.current) return;
    
    const canvas = fabricCanvasRef.current;
    const objects = canvas.getObjects();
    
    // Find the background image
    const backgroundImage = objects.find(obj => obj instanceof FabricImage);
    if (!backgroundImage || !(backgroundImage instanceof FabricImage)) return;
    
    // Get the background image properties
    const imgWidth = backgroundImage.width || 1;
    const imgHeight = backgroundImage.height || 1;
    const imgScaleX = (backgroundImage as any).scaleX || 1;
    const imgScaleY = (backgroundImage as any).scaleY || 1;
    const imgLeft = backgroundImage.left || 0;
    const imgTop = backgroundImage.top || 0;
    
    // Update all objects with relative position data
    objects.forEach(obj => {
      const relativePosition = (obj as any).relativePosition;
      if (!relativePosition) return;
      
      if (obj instanceof Rect && !((obj as any).isSelection)) {
        // This is a text background rectangle
        const { leftRatio, topRatio, widthRatio, heightRatio } = relativePosition;
        
        // Calculate new position based on the image
        const newLeft = imgLeft + (leftRatio * imgWidth * imgScaleX);
        const newTop = imgTop + (topRatio * imgHeight * imgScaleY);
        const newWidth = widthRatio * imgWidth * imgScaleX;
        const newHeight = heightRatio * imgHeight * imgScaleY;
        
        // Update the rectangle
        obj.set({
          left: newLeft,
          top: newTop,
          width: newWidth,
          height: newHeight,
          scaleX: 1,
          scaleY: 1
        });
      } else if (obj instanceof Text || obj instanceof Textbox) {
        // Handle both regular Text and Textbox objects
        const { leftRatio, topRatio, widthRatio, heightRatio } = relativePosition;
        
        // Calculate new position based on the image
        const newLeft = imgLeft + (leftRatio * imgWidth * imgScaleX);
        const newTop = imgTop + (topRatio * imgHeight * imgScaleY);
        const newWidth = widthRatio * imgWidth * imgScaleX;
        
        // Calculate new font size based on dimensions
        const fontSize = relativePosition.originalFontSize || 16;
        const fontSizeRatio = relativePosition.fontSizeRatio || 0.1;
        const newFontSize = Math.max(12, Math.min(newWidth * fontSizeRatio, 36));
        
        // Update the text positioning
        const updates: any = {
          left: newLeft,
          top: newTop,
          fontSize: newFontSize
        };
        
        // If it's a Textbox, update the width as well
        if (obj instanceof Textbox) {
          updates.width = newWidth;
        }
        
        // Apply all updates
        obj.set(updates);
      }
    });
    
    // Render the canvas
    canvas.renderAll();
  };

  // Call this function on window resize
  useEffect(() => {
    const handleResize = () => {
      updateTextElementPositions();
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);
  
  // Update the ref when the prop changes
  useEffect(() => {
    onTextSelectionRef.current = onTextSelection;
  }, [onTextSelection]);
  
  // Update the original image file reference when the image prop changes
  useEffect(() => {
    if (image) {
      originalImageFileRef.current = image;
      // Reset the current image blob when a new image is uploaded
      currentImageBlobRef.current = null;
    }
  }, [image]);
  
  // Function to export the canvas as a high-resolution image
  const exportCanvasAsImage = (): Promise<Blob | null> => {
    return new Promise((resolve, reject) => {
      try {
        if (!fabricCanvasRef.current || !originalImageDimensionsRef.current) {
          console.error("Canvas or original dimensions not available");
          resolve(null);
          return;
        }

        setLoadingStatus("Exporting image...");
        const canvas = fabricCanvasRef.current;
        
        // Get the original dimensions of the image
        const originalDimensions = originalImageDimensionsRef.current;
        
        // Store the current canvas state
        const currentZoom = canvas.getZoom();
        const originalVpt = [...canvas.viewportTransform || [1, 0, 0, 1, 0, 0]];
        
        // Temporarily reset zoom for accurate export
        canvas.setZoom(1);
        canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
        
        // Create a new canvas with original image dimensions for export
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = originalDimensions.width;
        exportCanvas.height = originalDimensions.height;
        const exportCtx = exportCanvas.getContext('2d');
        
        if (!exportCtx) {
          setLoadingStatus("Failed to create export context");
          resolve(null);
          return;
        }
        
        // Get all objects on the canvas
        const objects = canvas.getObjects();
        
        // Find the background image
        const backgroundImage = objects.find(obj => obj instanceof FabricImage);
        
        if (!backgroundImage || !(backgroundImage instanceof FabricImage)) {
          setLoadingStatus("Background image not found");
          resolve(null);
          return;
        }
        
        // Calculate scale factors
        const imgWidth = backgroundImage.width || 1;
        const imgHeight = backgroundImage.height || 1;
        const imgScaleX = (backgroundImage as any).scaleX || 1;
        const imgScaleY = (backgroundImage as any).scaleY || 1;
        const imgLeft = backgroundImage.left || 0;
        const imgTop = backgroundImage.top || 0;
        
        // Scale factors to convert from canvas to original image coordinates
        const scaleX = originalDimensions.width / (imgWidth * imgScaleX);
        const scaleY = originalDimensions.height / (imgHeight * imgScaleY);
        
        // Create a temporary canvas to render a full-resolution version of the canvas content
        const tempCanvas = document.createElement('canvas');
        const tempContext = tempCanvas.getContext('2d');
        
        // Clone the canvas to avoid modifying the original
        const tempFabricCanvas = new Canvas(tempCanvas);
        
        // Add a clone of each object (except selection rectangles and paths) to the temp canvas
        const objectsToRender = objects.filter(obj => 
          obj instanceof FabricImage || // Background image
          obj instanceof Text || // Text objects
          obj instanceof Textbox || // Textbox objects
          (obj instanceof Rect && (obj as any).fill === 'white' && !(obj as any).stroke) // White rectangles (background for text)
        );
        
        // First, add the background image to draw at the correct resolution
        const imgElement = (backgroundImage as any)._element;
        if (imgElement) {
          exportCtx.drawImage(
            imgElement, 
            0, 0, 
            originalDimensions.width, 
            originalDimensions.height
          );
        }
        
        // Now draw all other objects (white rectangles and text)
        // Process in order: rectangles first, then text (to maintain proper layering)
        
        // First draw white rectangles (text backgrounds)
        const rectObjects = objectsToRender.filter(obj => 
          obj instanceof Rect && (obj as any).fill === 'white' && !(obj as any).stroke
        );
        
        rectObjects.forEach(obj => {
          const rect = obj as Rect;
          const left = ((rect.left || 0) - imgLeft) * scaleX;
          const top = ((rect.top || 0) - imgTop) * scaleY;
          const width = ((rect.width || 0) * (rect.scaleX || 1)) * scaleX;
          const height = ((rect.height || 0) * (rect.scaleY || 1)) * scaleY;
          
          exportCtx.fillStyle = 'white';
          exportCtx.fillRect(left, top, width, height);
        });
        
        // Then draw text objects
        const textObjects = objectsToRender.filter(obj => 
          obj instanceof Text || obj instanceof Textbox
        );
        
        textObjects.forEach(obj => {
          const textObj = obj as Text | Textbox;
          
          // Get coordinates in the original image space
          const left = ((textObj.left || 0) - imgLeft) * scaleX;
          const top = ((textObj.top || 0) - imgTop) * scaleY;
          
          // Scale font size to match the original image resolution
          const fontSize = (textObj.fontSize || 16) * scaleX;
          
          // Set text properties
          exportCtx.font = `${fontSize}px ${textObj.fontFamily}`;
          exportCtx.fillStyle = textObj.fill || 'black';
          exportCtx.textAlign = (textObj.textAlign as CanvasTextAlign) || 'left';
          exportCtx.textBaseline = 'top'; // Important for proper text positioning
          
          // Draw the text
          if (textObj instanceof Textbox) {
            // Calculate line height
            const lineHeight = textObj.lineHeight || 1.16;
            const width = ((textObj.width || 0) * (textObj.scaleX || 1)) * scaleX;
            
            // Try multiple ways to get the wrapped lines
            // Fabric.js has different properties in different versions
            let wrappedLines: string[] = [];
            let wrappingSource = 'unknown';
            
            // Try to access internal properties that might contain wrapped lines
            const fabricTextbox = textObj as any;
            
            // First try using Fabric's own methods for wrapping if available
            if (typeof fabricTextbox._splitTextIntoLines === 'function' && fabricTextbox.width) {
              try {
                // Use Fabric's internal method if available
                const result = fabricTextbox._splitTextIntoLines(fabricTextbox.text);
                if (result && Array.isArray(result.lines) && result.lines.length > 0) {
                  wrappedLines = result.lines;
                  wrappingSource = '_splitTextIntoLines';
                }
              } catch (e) {
                console.warn('Error using _splitTextIntoLines:', e);
              }
            } else if (typeof fabricTextbox._wrapText === 'function' && fabricTextbox.width) {
              try {
                // Alternative wrapping method
                const lines = fabricTextbox.text.split('\n');
                const result = fabricTextbox._wrapText(lines, fabricTextbox.width);
                if (Array.isArray(result) && result.length > 0) {
                  wrappedLines = result.map((line: any) => 
                    Array.isArray(line) ? (line as any[]).join('') : line
                  );
                  wrappingSource = '_wrapText';
                }
              } catch (e) {
                console.warn('Error using _wrapText:', e);
              }
            }
            
            // If the methods above failed, fall back to accessing properties directly
            if (wrappedLines.length === 0) {
              if (Array.isArray(fabricTextbox.textLines) && fabricTextbox.textLines.length > 0) {
                // Most common property for wrapped lines
                wrappedLines = fabricTextbox.textLines;
                wrappingSource = 'textLines';
              } else if (Array.isArray(fabricTextbox._textLines) && fabricTextbox._textLines.length > 0) {
                // Alternative property sometimes used
                wrappedLines = fabricTextbox._textLines.map((line: any) => 
                  Array.isArray(line) ? (line as any[]).join('') : line
                );
                wrappingSource = '_textLines';
              } else if (Array.isArray(fabricTextbox._unwrappedTextLines) && fabricTextbox._unwrappedTextLines.length > 0) {
                // Another alternative
                wrappedLines = fabricTextbox._unwrappedTextLines.map((line: any) => 
                  Array.isArray(line) ? (line as any[]).join('') : line
                );
                wrappingSource = '_unwrappedTextLines';
              } else if (fabricTextbox.__cachedLines && Array.isArray(fabricTextbox.__cachedLines.lines)) {
                // Try the cached lines if available
                wrappedLines = fabricTextbox.__cachedLines.lines;
                wrappingSource = '__cachedLines';
              } else if (fabricTextbox.text) {
                // Fallback to basic splitting if no wrapped lines found
                wrappedLines = fabricTextbox.text.split('\n');
                wrappingSource = 'manual split';
              }
            }
            
            console.log('Using wrapped lines from:', wrappingSource, 'Count:', wrappedLines.length);
            
            // Draw each line
            wrappedLines.forEach((line: string, i: number) => {
              if (typeof line !== 'string') {
                // Handle cases where line might be an array of characters
                if (Array.isArray(line)) {
                  line = (line as any[]).join('');
                } else {
                  return; // Skip invalid lines
                }
              }
              
              const yPos = top + (i * lineHeight * fontSize);
              
              // Handle text alignment
              let xPos = left;
              if (textObj.textAlign === 'center') {
                xPos = left + (width / 2);
              } else if (textObj.textAlign === 'right') {
                xPos = left + width;
              }
              
              exportCtx.fillText(line, xPos, yPos);
            });
          } else {
            // Simple text rendering for Text objects
            exportCtx.fillText(textObj.text || '', left, top);
          }
        });
        
        // Restore the original canvas state
        canvas.setZoom(currentZoom);
        canvas.setViewportTransform(originalVpt);
        canvas.renderAll();
        
        // Convert the export canvas to a blob
        exportCanvas.toBlob((blob) => {
          if (blob) {
            setLoadingStatus("Image exported successfully");
            setTimeout(() => setLoadingStatus(""), 1500);
            resolve(blob);
          } else {
            setLoadingStatus("Failed to export image");
            setTimeout(() => setLoadingStatus(""), 1500);
            resolve(null);
          }
        }, 'image/png');
      } catch (error) {
        console.error("Error exporting image:", error);
        setLoadingStatus(`Error exporting image: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setTimeout(() => setLoadingStatus(""), 1500);
        resolve(null);
      }
    });
  };
  
  // Render the component
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
        backgroundColor: '#f5f5f5',
        overflow: 'hidden',
        position: 'relative', // Ensure container is positioned for absolute child positioning
        cursor: isInpainting ? 'wait' : undefined
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
      
      
      {/* Inpainting overlay */}
      {isInpainting && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.3)',
          zIndex: 100,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          pointerEvents: 'all'
        }}>
          <div style={{
            padding: '10px 20px',
            backgroundColor: 'rgba(0,0,0,0.7)',
            color: '#fff',
            borderRadius: '4px',
            fontSize: '14px'
          }}>
            Processing... Please wait
          </div>
        </div>
      )}
    </div>
  );
});

export default CanvasEditor; 