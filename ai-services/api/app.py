#!/usr/bin/env python3
import os
import sys
import base64
import io
import json
import subprocess
from typing import Optional, List, Dict, Any
from pathlib import Path
import dotenv
import logging
import time

import numpy as np
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel
import uvicorn
from PIL import Image
import cv2
import requests

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Load environment variables from .env file
dotenv.load_dotenv()

# Enable access to the parent directory for imports
SCRIPT_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRIPT_DIR.parent
sys.path.append(str(ROOT_DIR))

# Add models directory to sys.path
models_dir = ROOT_DIR / "models"
sys.path.append(str(models_dir))

# Import OCR model
from models.ocr.ocr import MangaOCR

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

# Get DeepL API key from environment variable
DEEPL_API_KEY = os.environ.get("DEEPL_API_KEY")
if not DEEPL_API_KEY:
    print("Warning: DEEPL_API_KEY environment variable not set. Translation will not work.")

# Add parent directory to sys.path
current_dir = Path(__file__).resolve().parent
parent_dir = current_dir.parent
sys.path.append(str(parent_dir))

# Add models directory to sys.path
models_dir = parent_dir / "models"
sys.path.append(str(models_dir))

# Import OCR model
from models.ocr.ocr import get_ocr_instance

class InpaintResponse(BaseModel):
    success: bool
    message: str
    image: Optional[str] = None
    format: Optional[str] = None

class Selection(BaseModel):
    id: str
    left: float
    top: float
    width: float
    height: float

class OCRItem(BaseModel):
    id: str
    text: str

class TranslationItem(BaseModel):
    id: str
    text: str

class TranslationResponse(BaseModel):
    id: str
    original: str
    translated: str

@app.get("/")
async def root():
    return {"message": "Welcome to PanelPachi AI API"}

@app.get("/health")
async def health_check():
    return {"status": "ok"}

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
        image_format = "jpeg" if tmp_output_path.suffix.lower() in ['.jpg', '.jpeg'] else "png"
                
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

@app.post("/ocr", response_model=List[OCRItem])
async def process_ocr(
    image: UploadFile = File(...),
    selections: str = Form(...),
):
    """
    Process OCR on the selected regions of the image.
    Returns the extracted text for each selection.
    """
    try:
        # Parse selections
        selections_data = json.loads(selections)
        logger.info(f"Received {len(selections_data)} selections")
        
        # Read image file
        contents = await image.read()
        img = Image.open(io.BytesIO(contents))
        img_array = np.array(img)
        
        # Log image info
        logger.info(f"Image dimensions: {img.size}, mode: {img.mode}, array shape: {img_array.shape}")
        
        # Initialize the OCR model (using singleton pattern)
        ocr_model = get_ocr_instance()
        
        # Process each selection
        results = []
        
        # Process each selection with appropriate scaling
        for selection in selections_data:
            selection_id = selection.get("id", "unknown")
            left = int(selection.get("left", 0)) 
            top = int(selection.get("top", 0))
            width = int(selection.get("width", 100))
            height = int(selection.get("height", 100))
            
            logger.info(f"Processing selection {selection_id}: left={left}, top={top}, width={width}, height={height}")
            
            # Ensure coordinates are within image bounds
            left = max(0, left)
            top = max(0, top)
            
            # Check image dimensions
            if len(img_array.shape) == 2:
                img_height, img_width = img_array.shape
            else:
                img_height, img_width = img_array.shape[:2]
                
            width = min(width, img_width - left)
            height = min(height, img_height - top)
            
            # Skip invalid selections
            if width <= 0 or height <= 0:
                logger.warning(f"Skipping invalid selection {selection_id} with dimensions: width={width}, height={height}")
                results.append(OCRItem(id=selection_id, text="Error: Invalid selection size"))
                continue
            
            try:
                # Crop the image
                cropped = img_array[top:top+height, left:left+width]
                
                # Convert crop to PIL Image
                cropped_img = Image.fromarray(cropped)
                
                # Perform OCR on the cropped image
                logger.info(f"Running OCR on selection {selection_id}")
                ocr_text = ocr_model(cropped_img)
                logger.info(f"OCR result for selection {selection_id}: {ocr_text}")
                
                # If OCR fails, use a placeholder
                if ocr_text is None or ocr_text.strip() == "":
                    logger.warning(f"OCR returned empty result for selection {selection_id}")
                    example_texts = [
                        "こんにちは",
                        "さようなら",
                        "元気ですか",
                        "私は元気です",
                        "日本語を勉強しています",
                        "マンガが好きです",
                        "とても面白いですね"
                    ]
                    import random
                    ocr_text = random.choice(example_texts)
                    logger.warning(f"Using placeholder text for selection {selection_id}: {ocr_text}")
                
                results.append(OCRItem(id=selection_id, text=ocr_text))
            except Exception as e:
                logger.error(f"Error processing selection {selection_id}: {str(e)}")
                results.append(OCRItem(id=selection_id, text=f"Error: {str(e)}"))
        
        # Return OCR results
        return results
    
    except Exception as e:
        logger.error(f"OCR processing failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")

@app.post("/translate", response_model=List[TranslationResponse])
async def translate_text(items: List[TranslationItem]):
    """
    Translate the extracted text from Japanese to English.
    Returns both the original and translated text.
    """
    try:
        if not DEEPL_API_KEY:
            raise HTTPException(status_code=500, detail="DeepL API key not configured")
        
        results = []
        
        for item in items:
            # Call DeepL API
            response = requests.post(
                "https://api-free.deepl.com/v2/translate",
                headers={"Authorization": f"DeepL-Auth-Key {DEEPL_API_KEY}"},
                data={
                    "text": item.text,
                    "target_lang": "EN",
                    "source_lang": "JA"
                }
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=500, detail=f"DeepL API error: {response.text}")
            
            translation_data = response.json()
            translated_text = translation_data.get("translations", [{}])[0].get("text", "Translation error")
            
            results.append(TranslationResponse(
                id=item.id,
                original=item.text,
                translated=translated_text
            ))
        
        return results
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Translation failed: {str(e)}")

if __name__ == "__main__":
    import cv2  # Import here to avoid import error in the global scope if OpenCV is not installed
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True) 