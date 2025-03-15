import os
import sys
import base64
import io
import json
from typing import Optional, List
from pathlib import Path
import dotenv
import logging
import numpy as np
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
from PIL import Image
import cv2
import requests
import torch
from contextlib import asynccontextmanager
# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# General paths
SCRIPT_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRIPT_DIR.parent
sys.path.append(str(ROOT_DIR))

# Models paths
MODELS_DIR = ROOT_DIR / "models"
INPAINTING_DIR = MODELS_DIR / "inpainting"
INPAINTING_SCRIPT = INPAINTING_DIR / "inpaint_api.py"
OCR_DIR = MODELS_DIR / "ocr"
OCR_SCRIPT = OCR_DIR / "ocr.py"
sys.path.append(str(MODELS_DIR))

# Import models
from models.ocr.ocr import get_ocr_instance
from models.inpainting.model import AnimeLaMa
# Load environment variables from .env file
dotenv.load_dotenv(ROOT_DIR / ".env")

# Get DeepL API key from environment variable
DEEPL_API_KEY = os.environ.get("DEEPL_API_KEY")
if not DEEPL_API_KEY:
    print("Warning: DEEPL_API_KEY environment variable not set. Translation will not work.")


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

inpaint_model = None
ocr_model = None

def translate_batch(texts: List[str]) -> List[str]:
    """
    Translate a batch of texts from Japanese to English using the DeepL API.

    Args:
        texts (List[str]): List of texts to translate.

    Returns:
        List[str]: List of translated texts in the same order as the input.

    Raises:
        ValueError: If the API key is missing or the API request fails.
    """
    if not DEEPL_API_KEY:
        raise ValueError("DeepL API key not configured")

    response = requests.post(
        "https://api-free.deepl.com/v2/translate",
        headers={"Authorization": f"DeepL-Auth-Key {DEEPL_API_KEY}"},
        data={
            "text": texts,  # DeepL accepts a list of texts
            "target_lang": "EN",
            "source_lang": "JA"
        }
    )

    if response.status_code != 200:
        raise ValueError(f"DeepL API error: {response.text}")

    translation_data = response.json()
    translations = [t.get("text", "Translation error") for t in translation_data.get("translations", [])]

    if len(translations) != len(texts):
        raise ValueError("Mismatch in number of translations received from DeepL")

    return translations

@asynccontextmanager
async def lifespan(app: FastAPI):
    #startup: load models
    global inpaint_model, ocr_model
    # Initialize inpainting model with dynamic device selection
    device = "cuda" if torch.cuda.is_available() else "cpu"
    inpaint_model = AnimeLaMa(device=device)
    print(f"Inpainting model loaded on {device}")

    # Initialize OCR model
    ocr_model = get_ocr_instance()
    print("OCR model loaded")

    yield

    print("Shutting down...")
    
app = FastAPI(
    title="PanelPachi AI API", 
    description="API for manga panel inpainting and other AI services",
    lifespan=lifespan
)

# Add CORS middleware to allow cross-origin requests from the web app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development - restrict this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"message": "Welcome to PanelPachi AI API"}

@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/inpaint")
async def inpaint_image(image: UploadFile, mask: UploadFile):
    """
    Inpaint an image using the provided mask.
    
    - **image**: The original image file
    - **mask**: The binary mask image file where white pixels (255) indicate areas to inpaint
    
    Returns the inpainted image as a base64-encoded string.
    """
    try:
        img = Image.open(image.file).convert("RGB")
        mask_img = Image.open(mask.file).convert("L")  # Grayscale

        # Convert to numpy arrays
        img_np = np.array(img)
        mask_np = np.array(mask_img)

        # Validate dimensions
        if img_np.shape[:2] != mask_np.shape[:2]:
            raise HTTPException(400, "Mask dimensions must match image dimensions")
        
        # Prepare mask (binary threshold)
        _, mask_np = cv2.threshold(mask_np, 127, 255, cv2.THRESH_BINARY)
        
        # Convert RGB to BGR for model compatibility
        img_np = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
        
        # Perform inpainting using the global inpaint_model
        result = inpaint_model.inpaint(img_np, mask_np)
        
        # Convert result back to RGB
        result_rgb = cv2.cvtColor(result, cv2.COLOR_BGR2RGB)
        
        # Encode output as PNG
        output_img = Image.fromarray(result_rgb)
        buffered = io.BytesIO()
        output_img.save(buffered, format="PNG")
        img_base64 = base64.b64encode(buffered.getvalue()).decode("utf-8")
        
        return {
            "success": True,
            "message": "Inpainting completed successfully",
            "image": img_base64,
            "format": "png"
        }
    except Exception as e:
        raise HTTPException(500, f"Inpainting failed: {str(e)}")
    
@app.post("/ocr", response_model=List[OCRItem])
async def process_ocr(
    image: UploadFile = File(...),
    selections: str = Form(...),
):
    """
    Process OCR on selected regions of an uploaded image.
    Returns extracted text for each selection.

    - **image**: The image file to process.
    - **selections**: JSON string containing a list of selections with id, left, top, width, height.
    """
    try:
        # Parse and validate selections
        try:
            selections_data = json.loads(selections)
            if not isinstance(selections_data, list):
                raise ValueError("Selections must be a list")
            for sel in selections_data:
                required_keys = {"id", "left", "top", "width", "height"}
                if not all(key in sel for key in required_keys):
                    raise ValueError(f"Selection missing required fields: {required_keys}")
                # Validate numeric values
                for key in ["left", "top", "width", "height"]:
                    if not isinstance(sel[key], (int, float)) or sel[key] < 0:
                        raise ValueError(f"Selection {sel['id']}: '{key}' must be a non-negative number")
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=400, detail=f"Invalid selections JSON: {str(e)}")
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        
        logger.info(f"Received {len(selections_data)} valid selections")

        # Read and validate image
        contents = await image.read()
        try:
            img = Image.open(io.BytesIO(contents)).convert("RGB")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid image data: {str(e)}")
        
        img_array = np.array(img)
        img_height, img_width = img_array.shape[:2]
        logger.info(f"Image loaded: {img_width}x{img_height}, RGB mode")

        # Get OCR model instance
        ocr_model = get_ocr_instance()
        if ocr_model.model_load_error:
            raise HTTPException(status_code=500, detail=f"OCR model unavailable: {ocr_model.model_load_error}")

        # Process selections
        results = []
        for selection in selections_data:
            selection_id = selection["id"]
            left = int(selection["left"])
            top = int(selection["top"])
            width = int(selection["width"])
            height = int(selection["height"])

            # Adjust coordinates to image bounds
            left = max(0, min(left, img_width - 1))
            top = max(0, min(top, img_height - 1))
            right = min(left + width, img_width)
            bottom = min(top + height, img_height)
            width = right - left
            height = bottom - top

            logger.info(f"Processing selection {selection_id}: left={left}, top={top}, width={width}, height={height}")

            if width <= 0 or height <= 0:
                logger.warning(f"Invalid selection {selection_id}: width={width}, height={height}")
                results.append(OCRItem(id=selection_id, text="Error: Invalid selection size"))
                continue

            try:
                # Crop image
                cropped_array = img_array[top:bottom, left:right]
                cropped_img = Image.fromarray(cropped_array)

                # Perform OCR
                logger.info(f"Running OCR on selection {selection_id}")
                ocr_text = ocr_model(cropped_img)
                
                # Handle OCR failure
                if ocr_text is None or ocr_text.strip() == "":
                    logger.warning(f"OCR failed for selection {selection_id}")
                    ocr_text = "Error: No text detected"
                
                logger.info(f"OCR result for {selection_id}: {ocr_text}")
                results.append(OCRItem(id=selection_id, text=ocr_text))
            except Exception as e:
                logger.error(f"Error processing selection {selection_id}: {str(e)}")
                results.append(OCRItem(id=selection_id, text=f"Error: {str(e)}"))
            
        return results
    except Exception as e:
        logger.error(f"Error processing OCR: {str(e)}")
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")
    
@app.post("/translate", response_model=List[TranslationResponse])
async def translate_text(items: List[TranslationItem]):
    """
    Translate extracted text from Japanese to English using DeepL API.

    Args:
        items (List[TranslationItem]): List of items containing id and text to translate.

    Returns:
        List[TranslationResponse]: List of responses with id, original text, and translated text.

    Raises:
        HTTPException: If input is invalid or translation fails.
    """
    if not items:
        raise HTTPException(status_code=400, detail="No items provided for translation")

    # Extract texts and ids from items
    texts = [item.text for item in items]
    ids = [item.id for item in items]

    logger.info(f"Translating {len(items)} items")

    try:
        translations = translate_batch(texts)
        results = [
            TranslationResponse(id=id_, original=text, translated=translation)
            for id_, text, translation in zip(ids, texts, translations)
        ]
        return results
    except ValueError as e:
        logger.error(f"Translation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error during translation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Translation failed: {str(e)}")
    
if __name__ == "__main__":
    import cv2  # Import here to avoid import error in the global scope if OpenCV is not installed
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True) 