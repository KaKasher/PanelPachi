#!/usr/bin/env python3
import os
import sys
import base64
import io
import subprocess
from typing import Optional, List
from pathlib import Path

import numpy as np
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel
import uvicorn
from PIL import Image
import cv2

# Enable access to the parent directory for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

app = FastAPI(title="PanelPachi AI API", 
              description="API for manga panel inpainting and other AI services")

# Add CORS middleware to allow cross-origin requests from the web app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development - restrict this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Path to the inpainting model script
MODELS_DIR = Path(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))) / "models"
INPAINTING_DIR = MODELS_DIR / "inpainting"
INPAINTING_SCRIPT = INPAINTING_DIR / "inpaint_api.py"

class InpaintResponse(BaseModel):
    success: bool
    message: str
    image: Optional[str] = None
    format: Optional[str] = None

@app.get("/")
async def root():
    return {"message": "Welcome to PanelPachi AI API"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.post("/inpaint", response_model=InpaintResponse)
async def inpaint_image(
    image: UploadFile = File(...),
    mask: UploadFile = File(...),
):
    """
    Inpaint an image using the provided mask.
    
    - **image**: The original image file
    - **mask**: The binary mask image file where white pixels (255) indicate areas to inpaint
    
    Returns the inpainted image as a base64-encoded string.
    """
    try:
        # Read input files
        image_data = await image.read()
        mask_data = await mask.read()
        
        # Store image filename for debugging
        image_filename = image.filename
        print(f"Received image filename: {image_filename}")
        input_ext = os.path.splitext(image_filename)[1].lower() if image_filename else '.png'
        print(f"Determined input extension: {input_ext}")
        
        # Convert to PIL Images
        try:
            print(f"Attempting to read image data, size: {len(image_data)} bytes")
            image_pil = Image.open(io.BytesIO(image_data))
            print(f"Image opened successfully: {image_pil.format}, {image_pil.size}")
        except Exception as e:
            print(f"Error opening image: {str(e)}")
            # Log first few bytes for debugging
            if len(image_data) > 0:
                print(f"First 20 bytes of image data: {image_data[:20]}")
            else:
                print("Image data is empty")
            raise HTTPException(status_code=400, detail=f"Invalid image data: {str(e)}")
        
        try:
            mask_pil = Image.open(io.BytesIO(mask_data))
            print(f"Mask opened successfully: {mask_pil.format}, {mask_pil.size}")
        except Exception as e:
            print(f"Error opening mask: {str(e)}")
            # Log first few bytes for debugging
            if len(mask_data) > 0:
                print(f"First 20 bytes of mask data: {mask_data[:20]}")
            else:
                print("Mask data is empty")
            raise HTTPException(status_code=400, detail=f"Invalid mask data: {str(e)}")
        
        # Convert to numpy arrays
        image_np = np.array(image_pil)
        mask_np = np.array(mask_pil)
        
        # If mask is RGB, convert to grayscale
        if len(mask_np.shape) == 3 and mask_np.shape[2] == 3:
            mask_np = np.mean(mask_np, axis=2).astype(np.uint8)
        
        # Threshold mask to binary (0 or 255)
        _, mask_np = cv2.threshold(mask_np, 127, 255, cv2.THRESH_BINARY)
        
        # Create inpaint_api.py if it doesn't exist
        create_inpaint_api_script()
        
        # Call the inpainting script as a subprocess
        # For this implementation, we'll create temporary files to pass between processes
        tmp_dir = Path("/tmp/panelpachi")
        tmp_dir.mkdir(exist_ok=True)
        
        tmp_image_path = tmp_dir / f"tmp_image_{os.getpid()}.png"
        tmp_mask_path = tmp_dir / f"tmp_mask_{os.getpid()}.png"
        tmp_output_path = tmp_dir / f"tmp_output_{os.getpid()}.png"
        
        # Save temporary files
        image_pil.save(tmp_image_path)
        
        # Ensure mask is saved as grayscale
        Image.fromarray(mask_np).save(tmp_mask_path)
        
        # Run the inpainting subprocess
        env = os.environ.copy()
        python_executable = sys.executable
        
        # Get the python executable from the inpainting model's virtual environment if it exists
        venv_python = INPAINTING_DIR / ".venv" / "bin" / "python"
        if venv_python.exists():
            python_executable = str(venv_python)
        
        cmd = [
            python_executable,
            str(INPAINTING_SCRIPT),
            "--image", str(tmp_image_path),
            "--mask", str(tmp_mask_path),
            "--output", str(tmp_output_path),
            "--device", "cpu"  # Default to CPU - can be changed based on availability
        ]
        
        process = subprocess.run(
            cmd,
            env=env,
            capture_output=True,
            text=True
        )
        
        if process.returncode != 0:
            raise HTTPException(
                status_code=500, 
                detail=f"Inpainting failed: {process.stderr}"
            )
        
        # Read the output image
        if not tmp_output_path.exists():
            raise HTTPException(
                status_code=500,
                detail="Inpainting did not produce output file"
            )
        
        # For debugging: Save a copy of the inpainted image
        debug_output_dir = Path("debug_output")
        debug_output_dir.mkdir(exist_ok=True)
        debug_output_path = debug_output_dir / f"inpainted_{image.filename}"
        import shutil
        shutil.copy(tmp_output_path, debug_output_path)
        print(f"Saved debug inpainted image to: {debug_output_path}")
        
        # Also save the input image and mask for comparison
        input_debug_path = debug_output_dir / f"input_{image.filename}"
        mask_debug_path = debug_output_dir / f"mask_{image.filename.replace('.jpg', '.png').replace('.jpeg', '.png')}"
        shutil.copy(tmp_image_path, input_debug_path)
        shutil.copy(tmp_mask_path, mask_debug_path)
        print(f"Saved debug input image to: {input_debug_path}")
        print(f"Saved debug mask image to: {mask_debug_path}")
        
        # Convert output to base64
        with open(tmp_output_path, "rb") as f:
            output_data = f.read()
            output_base64 = base64.b64encode(output_data).decode("utf-8")
            print(f"Base64 image size: {len(output_base64)} bytes")
            print(f"First 30 characters of base64: {output_base64[:30]}...")
        
        # Only clean up temporary files after successful processing
        for path in [tmp_image_path, tmp_mask_path, tmp_output_path]:
            if path.exists():
                path.unlink()
                
        # Determine image format for the data URL
        image_format = "jpeg" if debug_output_path.suffix.lower() in ['.jpg', '.jpeg'] else "png"
                
        return InpaintResponse(
            success=True,
            message="Inpainting completed successfully",
            image=output_base64,
            format=image_format
        )
    
    except Exception as e:
        import traceback
        return InpaintResponse(
            success=False,
            message=f"Inpainting failed: {str(e)}\n{traceback.format_exc()}"
        )

def create_inpaint_api_script():
    """Create the inpaint_api.py script if it doesn't exist"""
    if INPAINTING_SCRIPT.exists():
        return
    
    script_content = """#!/usr/bin/env python3
import os
import sys
import argparse
from pathlib import Path

import cv2
import torch
import numpy as np

# Add the parent directory to the path to allow importing from sibling modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from model import AnimeLaMa
from helper import prepare_image_mask, ensure_directory

def parse_args():
    parser = argparse.ArgumentParser(description="Anime-LaMa inpainting API script")
    parser.add_argument("--image", type=str, required=True, help="Path to input image file")
    parser.add_argument("--mask", type=str, required=True, help="Path to mask image file")
    parser.add_argument("--output", type=str, required=True, help="Path to output image file")
    parser.add_argument("--device", type=str, default="cuda", help="Device to use (cuda or cpu)")
    
    return parser.parse_args()

def main():
    args = parse_args()
    
    # Check CUDA availability if requested
    if args.device == "cuda" and not torch.cuda.is_available():
        print("CUDA requested but not available. Using CPU instead.")
        args.device = "cpu"
    
    # Initialize model
    print(f"Initializing Anime-LaMa model on {args.device}...")
    model = AnimeLaMa(device=args.device)
    
    # Process the image and mask
    try:
        image, mask = prepare_image_mask(args.image, args.mask)
        
        # Run inpainting
        result = model.inpaint(image, mask)
        
        # Ensure output directory exists
        ensure_directory(os.path.dirname(args.output))
        
        # Save result
        cv2.imwrite(args.output, result)
        print(f"Processed: {args.image} -> {args.output}")
        return 0
    except Exception as e:
        print(f"Error processing image: {str(e)}", file=sys.stderr)
        return 1

if __name__ == "__main__":
    sys.exit(main())
"""
    
    with open(INPAINTING_SCRIPT, "w") as f:
        f.write(script_content)
    
    # Make it executable
    os.chmod(INPAINTING_SCRIPT, 0o755)

if __name__ == "__main__":
    import cv2  # Import here to avoid import error in the global scope if OpenCV is not installed
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True) 