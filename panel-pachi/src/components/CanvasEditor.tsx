import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Canvas, Image as FabricImage, PencilBrush, Rect } from 'fabric';
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
  updateSelectedTextStyle: (style: { fontFamily?: string, fontSize?: number, color?: string }) => void;
  isTextSelected: () => boolean;
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
  const selectedTextRef = useRef<HTMLElement | null>(null);
  
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
    updateSelectedTextStyle: (style: { fontFamily?: string, fontSize?: number, color?: string }) => {
      // Use the selectedTextRef instead of searching for active element
      const selectedElement = selectedTextRef.current;
      
      if (!selectedElement) return;
      
      // Apply styles to the selected element
      if (style.fontFamily) {
        selectedElement.style.fontFamily = style.fontFamily;
      }
      
      if (style.fontSize) {
        selectedElement.style.fontSize = `${style.fontSize}px`;
      }
      
      if (style.color) {
        selectedElement.style.color = style.color;
      }
    },
    isTextSelected: () => {
      return selectedTextRef.current !== null;
    }
  }));
  
  // Function to add translated text to the canvas
  const addTranslatedTextToCanvas = async (translation: Translation) => {
    if (!fabricCanvasRef.current || !originalImageDimensionsRef.current) return;
    
    const canvas = fabricCanvasRef.current;
    
    try {
      // Show loading status
      setLoadingStatus(translation.useInpainting ? "Inpainting text area..." : "Adding text to image...");
      
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
          
          // Clear the canvas
          canvas.clear();
          
          // Add the new image to the canvas
          const fabricImg = new FabricImage(inpaintedImg);
          
          // Calculate scaling to fit in canvas
          const canvasContainerWidth = canvas.getWidth();
          const canvasContainerHeight = canvas.getHeight();
          const scaleFactor = Math.min(
            canvasContainerWidth / inpaintedImg.width,
            canvasContainerHeight / inpaintedImg.height
          ) * 0.95; // 95% to leave some margin
          
          fabricImg.scale(scaleFactor);
          
          // Center the image
          canvas.centerObject(fabricImg);
          fabricImg.selectable = false;
          fabricImg.evented = false;
          
          // Add to canvas
          canvas.add(fabricImg);
          canvas.renderAll();
          
          // Clean up
          URL.revokeObjectURL(inpaintedImageUrl);
        } catch (error) {
          console.error("Inpainting failed:", error);
          setLoadingStatus("Inpainting failed. Using white rectangle instead.");
          
          // Fall back to the white rectangle method
          const whiteRect = new Rect({
            left: canvasLeft,
            top: canvasTop,
            width: canvasWidth,
            height: canvasHeight,
            fill: 'white',
            selectable: false,
            evented: false,
          });
          
          // Add to canvas
          canvas.add(whiteRect);
          
          // Add to history
          historyStackRef.current.push({
            type: 'selection',
            data: whiteRect
          });
        } finally {
          // Reset inpainting state
          setIsInpainting(false);
          isInpaintingRef.current = false;
        }
      } else {
        // Default method: add a white rectangle to cover the original text
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
        
        // Add to history stack for undo
        historyStackRef.current.push({
          type: 'selection',
          data: whiteRect
        });
      }
      
      // Create a text object using a different approach to avoid fabric.js import issues
      const textObject = new Rect({
        left: canvasLeft,
        top: canvasTop,
        width: canvasWidth,
        height: canvasHeight,
        fill: 'rgba(0,0,0,0)', // Transparent fill 
        stroke: 'rgba(0,0,0,0)', // No border
        selectable: true,
        evented: true
      });
      
      // Add text as a separate DOM element over the canvas
      const textElement = document.createElement('div');
      textElement.style.position = 'absolute';
      textElement.style.left = `${canvasLeft}px`;
      textElement.style.top = `${canvasTop}px`;
      textElement.style.width = `${canvasWidth}px`;
      textElement.style.height = `${canvasHeight}px`;

      // Apply default text styling
      textElement.style.color = translation.textStyle?.color || 'black';
      textElement.style.fontFamily = translation.textStyle?.fontFamily || 'Arial';
      const fontSize = translation.textStyle?.fontSize || Math.min(20, canvasWidth / 10);
      textElement.style.fontSize = `${fontSize}px`;

      textElement.style.textAlign = 'center';
      textElement.style.display = 'flex';
      textElement.style.alignItems = 'center';
      textElement.style.justifyContent = 'center';
      textElement.style.pointerEvents = 'auto'; // Make sure it can receive events
      textElement.style.cursor = 'move';
      textElement.style.zIndex = '1000'; // Ensure it's above the canvas elements
      textElement.innerText = translation.translated;
      textElement.contentEditable = 'false'; // Start as non-editable, enable on double-click
      textElement.dataset.textId = `text-${Date.now()}`;
      
      // Add highlight/selection styling
      textElement.style.outline = 'none'; // Remove default focus outline
      textElement.style.transition = 'box-shadow 0.2s';

      // Create resize handles (initially hidden)
      const handles = ['nw', 'ne', 'se', 'sw'];
      const handleElements: HTMLElement[] = [];

      handles.forEach(position => {
        const handle = document.createElement('div');
        handle.className = `resize-handle resize-handle-${position}`;
        handle.style.position = 'absolute';
        handle.style.width = '12px';
        handle.style.height = '12px';
        handle.style.backgroundColor = 'white';
        handle.style.border = '2px solid #0075ff';
        handle.style.borderRadius = '50%';
        handle.style.display = 'none'; // Initially hidden
        handle.style.zIndex = '1001';
        handle.style.boxShadow = '0 0 3px rgba(0, 0, 0, 0.3)';
        handle.style.cursor = position === 'nw' ? 'nw-resize' : 
                              position === 'ne' ? 'ne-resize' : 
                              position === 'se' ? 'se-resize' : 'sw-resize';
        
        // Position the handles at the corners
        if (position === 'nw') {
          handle.style.top = '-6px';
          handle.style.left = '-6px';
        } else if (position === 'ne') {
          handle.style.top = '-6px';
          handle.style.right = '-6px';
        } else if (position === 'se') {
          handle.style.bottom = '-6px';
          handle.style.right = '-6px';
        } else if (position === 'sw') {
          handle.style.bottom = '-6px';
          handle.style.left = '-6px';
        }
        
        handle.dataset.position = position;
        handle.dataset.textId = textElement.dataset.textId;
        textElement.appendChild(handle);
        handleElements.push(handle);
      });

      // Helper function to show/hide resize handles
      const toggleResizeHandles = (show: boolean) => {
        handleElements.forEach(handle => {
          handle.style.display = show ? 'block' : 'none';
        });
      };

      // Add resize functionality
      handleElements.forEach(handle => {
        handle.addEventListener('mousedown', (e) => {
          e.stopPropagation(); // Prevent text element's mousedown from firing
          
          const position = handle.dataset.position;
          const startX = e.clientX;
          const startY = e.clientY;
          const startWidth = parseInt(textElement.style.width, 10);
          const startHeight = parseInt(textElement.style.height, 10);
          const startLeft = parseInt(textElement.style.left, 10);
          const startTop = parseInt(textElement.style.top, 10);
          
          const onResizeMove = (moveEvent: MouseEvent) => {
            moveEvent.preventDefault();
            
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;
            
            // Resize based on which handle was grabbed
            if (position === 'nw') {
              textElement.style.left = `${startLeft + dx}px`;
              textElement.style.top = `${startTop + dy}px`;
              textElement.style.width = `${startWidth - dx}px`;
              textElement.style.height = `${startHeight - dy}px`;
            } else if (position === 'ne') {
              textElement.style.top = `${startTop + dy}px`;
              textElement.style.width = `${startWidth + dx}px`;
              textElement.style.height = `${startHeight - dy}px`;
            } else if (position === 'se') {
              textElement.style.width = `${startWidth + dx}px`;
              textElement.style.height = `${startHeight + dy}px`;
            } else if (position === 'sw') {
              textElement.style.left = `${startLeft + dx}px`;
              textElement.style.width = `${startWidth - dx}px`;
              textElement.style.height = `${startHeight + dy}px`;
            }
          };
          
          const onResizeUp = () => {
            document.removeEventListener('mousemove', onResizeMove);
            document.removeEventListener('mouseup', onResizeUp);
          };
          
          document.addEventListener('mousemove', onResizeMove);
          document.addEventListener('mouseup', onResizeUp);
        });
      });

      // Add click handler to track selected text
      textElement.addEventListener('mousedown', (e) => {
        // Set this element as the selected text
        const allTextElements = containerRef.current?.querySelectorAll('[data-text-id]');
        
        // Remove selection styling from all text elements
        if (allTextElements) {
          allTextElements.forEach((el) => {
            if (el instanceof HTMLElement) {
              el.style.boxShadow = 'none';
              // Hide resize handles for all other elements
              const textId = el.dataset.textId;
              if (textId && textId !== textElement.dataset.textId) {
                const handles = el.querySelectorAll('.resize-handle');
                handles.forEach(handle => {
                  if (handle instanceof HTMLElement) {
                    handle.style.display = 'none';
                  }
                });
              }
            }
          });
        }
        
        // Update selected text reference
        selectedTextRef.current = textElement;
        
        // Add visual selection indicator
        textElement.style.boxShadow = '0 0 0 2px rgba(0, 123, 255, 0.5)';
        
        // Show resize handles when selected
        toggleResizeHandles(true);
        
        // Notify parent component of text selection
        handleTextSelectionChange(true);
        
        // For dragging functionality
        const initialX = e.clientX;
        const initialY = e.clientY;
        const startLeft = parseInt(textElement.style.left, 10) || 0;
        const startTop = parseInt(textElement.style.top, 10) || 0;
        
        const onMouseMove = (moveEvent: MouseEvent) => {
          const dx = moveEvent.clientX - initialX;
          const dy = moveEvent.clientY - initialY;
          textElement.style.left = `${startLeft + dx}px`;
          textElement.style.top = `${startTop + dy}px`;
          moveEvent.preventDefault();
        };
        
        const onMouseUp = () => {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
        };
        
        // Only enable dragging when not editing text (e.g., when not double-clicked)
        if (document.activeElement !== textElement) {
          document.addEventListener('mousemove', onMouseMove);
          document.addEventListener('mouseup', onMouseUp);
          e.preventDefault();
        }
      });

      // Add double-click handler for editing
      textElement.addEventListener('dblclick', (e) => {
        // Enable contentEditable
        textElement.contentEditable = 'true';
        textElement.focus();
        
        // Change cursor to text
        textElement.style.cursor = 'text';
        
        // Stop event propagation to prevent other handlers
        e.stopPropagation();
      });

      // Add blur handler to exit edit mode
      textElement.addEventListener('blur', () => {
        // Disable contentEditable when focus is lost
        textElement.contentEditable = 'false';
        
        // Change cursor back to move
        textElement.style.cursor = 'move';
      });

      // Add focus handler to ensure selected state is maintained when editing
      textElement.addEventListener('focus', () => {
        // Set this element as the selected text
        selectedTextRef.current = textElement;
        
        // Remove selection styling from all text elements
        const allTextElements = containerRef.current?.querySelectorAll('[data-text-id]');
        if (allTextElements) {
          allTextElements.forEach((el) => {
            if (el instanceof HTMLElement) {
              el.style.boxShadow = 'none';
            }
          });
        }
        
        // Add visual selection indicator
        textElement.style.boxShadow = '0 0 0 2px rgba(0, 123, 255, 0.5)';
        
        // Show resize handles
        toggleResizeHandles(true);
        
        // Notify parent component of text selection
        handleTextSelectionChange(true);
      });

      // Add to the container
      containerRef.current?.appendChild(textElement);

      // Set as selected text immediately
      selectedTextRef.current = textElement;
      textElement.style.boxShadow = '0 0 0 2px rgba(0, 123, 255, 0.5)';
      toggleResizeHandles(true); // Show resize handles initially
      handleTextSelectionChange(true);
      
      // Add to canvas
      canvas.add(textObject);
      canvas.renderAll();
      
      // Add to history stack for undo
      historyStackRef.current.push({
        type: 'selection',
        data: {
          fabricObject: textObject,
          domElement: textElement
        }
      });
      
      // Clear loading status
      setLoadingStatus("Text added successfully");
      setTimeout(() => setLoadingStatus(""), 1500);
    } catch (error) {
      console.error("Error adding text to canvas:", error);
      setLoadingStatus("Error adding text to canvas");
      setTimeout(() => setLoadingStatus(""), 1500);
      
      // Reset states
      setIsInpainting(false);
      isInpaintingRef.current = false;
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
      selectable: false,
      evented: false
    });
    
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
      // Check if we have any selections to undo
      if (selectionsRef.current.length > 0) {
        // Get the last selection
        const lastSelection = selectionsRef.current[selectionsRef.current.length - 1];
        
        // Remove the selection from the canvas
        canvas.remove(lastSelection.fabricObject);
        
        // Remove from selections array
        selectionsRef.current.pop();
        
        // Update has selections state
        if (onSelectionsChange) {
          onSelectionsChange(selectionsRef.current.length > 0);
        }
        
        canvas.renderAll();
        
        setLoadingStatus("Selection undone");
        setTimeout(() => {
          if (loadingStatus === "Selection undone") {
            setLoadingStatus("");
          }
        }, 1500);
        
        return;
      }
      
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
        const objects = canvas.getObjects();
        const data = lastAction.data;

        // If this is a text object with DOM element
        if (data && typeof data === 'object' && 'fabricObject' in data && 'domElement' in data) {
          // Remove the fabric object
          canvas.remove(data.fabricObject);
          
          // Remove the DOM element if it exists
          if (data.domElement && data.domElement.parentNode) {
            data.domElement.parentNode.removeChild(data.domElement);
          }
        } else {
          // Handle regular objects
          for (let i = 0; i < objects.length; i++) {
            if (objects[i] === lastAction.data) {
              // Remove found object from canvas
              canvas.remove(objects[i]);
              break;
            }
          }
        }

        canvas.renderAll();
        
        setLoadingStatus("Undone text placement");
        setTimeout(() => {
          if (loadingStatus === "Undone text placement") {
            setLoadingStatus("");
          }
        }, 1500);
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
    if (onTextSelection) {
      onTextSelection(selected);
    }
  };
  
  // Modify the document click handler to hide resize handles
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      // Check if click is outside text elements
      if (containerRef.current && e.target instanceof Node) {
        // Skip if clicking inside text element or on an element with the data-text-controls attribute
        let targetElement: Element | null = e.target instanceof Element ? e.target : null;
        let isTextElement = false;
        let isTextControl = false;
        let isResizeHandle = false;
        
        while (targetElement) {
          if (targetElement.hasAttribute('data-text-id')) {
            isTextElement = true;
            break;
          }
          if (targetElement.hasAttribute('data-text-controls')) {
            isTextControl = true;
            break;
          }
          if (targetElement.classList && targetElement.classList.contains('resize-handle')) {
            isResizeHandle = true;
            break;
          }
          targetElement = targetElement.parentElement;
        }
        
        // If clicking on a text element, text control, or resize handle, don't deselect
        if (isTextElement || isTextControl || isResizeHandle) {
          return;
        }
        
        // Clear selected text reference
        selectedTextRef.current = null;
        
        // Remove selection styling and hide resize handles from all text elements
        const allTextElements = containerRef.current.querySelectorAll('[data-text-id]');
        allTextElements.forEach((el) => {
          if (el instanceof HTMLElement) {
            el.style.boxShadow = 'none';
            
            // Hide resize handles
            const handles = el.querySelectorAll('.resize-handle');
            handles.forEach(handle => {
              if (handle instanceof HTMLElement) {
                handle.style.display = 'none';
              }
            });
          }
        });
        
        // Notify parent component of text selection change
        handleTextSelectionChange(false);
      }
    };
    
    // Add event listener when component mounts
    document.addEventListener('mousedown', handleDocumentClick);
    
    // Clean up event listener when component unmounts
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
    };
  }, [onTextSelection]);
  
  // Update the original image file reference when the image prop changes
  useEffect(() => {
    if (image) {
      originalImageFileRef.current = image;
      // Reset the current image blob when a new image is uploaded
      currentImageBlobRef.current = null;
    }
  }, [image]);
  
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
            
            // Clear the canvas
            canvas.clear();
            
            // Create a Fabric image from the inpainted image
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
            
            // Reset inpainting state
            setIsInpainting(false);
            isInpaintingRef.current = false;
            setLoadingStatus("Inpainting complete");
            
            // Clean up the URL
            URL.revokeObjectURL(inpaintedImageUrl);
            
            // After the inpainting is complete, clear the drawn paths from the canvas
            // Find and remove all path objects from the canvas
            const pathObjects = canvas.getObjects().filter(obj => obj.type === 'path');
            pathObjects.forEach(obj => canvas.remove(obj));
            canvas.renderAll();
            
            resolve();
          };
          
          img.onerror = (err) => {
            console.error("Error loading inpainted image:", err);
            setLoadingStatus("Failed to load inpainted image");
            setIsInpainting(false);
            isInpaintingRef.current = false;
            reject(new Error("Failed to load inpainted image"));
          };
        } catch (error: any) {
          setLoadingStatus(`Inpainting failed: ${error.message || 'Unknown error'}`);
          setIsInpainting(false);
          isInpaintingRef.current = false;
          reject(error);
        }
      } catch (error: any) {
        setLoadingStatus(`Inpainting failed: ${error.message || 'Unknown error'}`);
        setIsInpainting(false);
        isInpaintingRef.current = false;
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
      if (!containerRef.current || !fabricCanvasRef.current) return;
      
      const canvas = fabricCanvasRef.current;
      
      // Get new container dimensions
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;
      
      // Update canvas dimensions
      canvas.setWidth(containerWidth);
      canvas.setHeight(containerHeight);
      
      // Recalculate scaling for all objects
      const objects = canvas.getObjects();
      if (objects.length > 0 && objects[0] instanceof FabricImage) {
        const img = objects[0] as FabricImage;
        
        // Calculate scaling to fit the image in the canvas
        const scaleX = containerWidth / (img.width || 1);
        const scaleY = containerHeight / (img.height || 1);
        const scale = Math.min(scaleX, scaleY) * 0.95;
        
        img.scale(scale);
        
        // Center the image on the canvas
        canvas.centerObject(img);
      }
      
      canvas.renderAll();
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
    
    return () => {
      canvas.off('mouse:down', handleSelectionStart);
      canvas.off('mouse:move', handleSelectionMove);
      canvas.off('mouse:up', handleSelectionEnd);
    };
  }, [tool]);
  
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
        position: 'relative',
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
        Scroll: Brush Size • Ctrl+Scroll: Zoom • Ctrl+0: Reset • Middle Mouse: Pan
      </div>
      
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