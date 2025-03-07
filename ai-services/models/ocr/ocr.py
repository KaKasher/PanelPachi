#!/usr/bin/env python3

import argparse
import os
import torch
from PIL import Image
from transformers import VisionEncoderDecoderModel, AutoFeatureExtractor, AutoTokenizer
import logging
import numpy as np
from io import BytesIO
import time

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class MangaOCR:
    def __init__(self, model_name="kha-white/manga-ocr-base"):
        """Initialize the OCR model."""
        self.model_name = model_name
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info(f"Using device: {self.device}")
        
        # Initialize model attributes to None - will load on first use
        self.model = None
        self.feature_extractor = None
        self.tokenizer = None
        self.model_loaded = False
        self.model_load_error = None
        
    def _load_model(self):
        """
        Load the model components.
        This is lazy-loaded on first use to avoid issues during server startup.
        """
        if self.model_loaded or self.model_load_error:
            return
            
        try:
            # Load model components with proper error handling
            logger.info(f"Loading manga OCR model: {self.model_name}")
            start_time = time.time()
            
            # Load model with friendly error messages
            try:
                self.model = VisionEncoderDecoderModel.from_pretrained(self.model_name)
            except Exception as e:
                logger.error(f"Error loading model from {self.model_name}: {str(e)}")
                raise RuntimeError(f"Failed to load VisionEncoderDecoderModel: {str(e)}")
                
            try:
                self.feature_extractor = AutoFeatureExtractor.from_pretrained(self.model_name)
            except Exception as e:
                logger.error(f"Error loading feature extractor: {str(e)}")
                raise RuntimeError(f"Failed to load AutoFeatureExtractor: {str(e)}")
                
            try:
                self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
            except Exception as e:
                logger.error(f"Error loading tokenizer: {str(e)}")
                raise RuntimeError(f"Failed to load AutoTokenizer: {str(e)}")
            
            # Move model to appropriate device
            self.model.to(self.device)
            
            elapsed_time = time.time() - start_time
            logger.info(f"Model loaded successfully in {elapsed_time:.2f} seconds")
            self.model_loaded = True
        except Exception as e:
            logger.error(f"Error loading model components: {str(e)}")
            self.model_load_error = str(e)
            raise
        
    def validate_image(self, image):
        """Validate that the image is suitable for OCR processing.
        
        Args:
            image: PIL Image to validate
            
        Returns:
            (bool, str): (is_valid, error_message)
        """
        if image is None:
            return False, "Image is None"
        
        # Check image size
        if image.width < 10 or image.height < 10:
            return False, f"Image too small: {image.width}x{image.height}"
        
        # Check if the image is mostly empty/white
        try:
            img_array = np.array(image)
            if img_array.ndim == 3 and img_array.shape[2] >= 3:  # RGB or RGBA
                # Convert to grayscale for analysis
                gray = 0.2989 * img_array[:,:,0] + 0.5870 * img_array[:,:,1] + 0.1140 * img_array[:,:,2]
            elif img_array.ndim == 2:  # Already grayscale
                gray = img_array
            else:
                return False, f"Unexpected image format with dimensions: {img_array.shape}"
            
            # Check if the image is mostly white/empty
            if np.mean(gray) > 240:  # Mostly white
                return False, "Image appears to be mostly white/empty"
        except Exception as e:
            logger.warning(f"Error during image validation: {str(e)}")
            # Continue with OCR despite validation error
            
        return True, ""
    
    def __call__(self, image_input):
        """Perform OCR on the input image.
        
        Args:
            image_input: Can be a path to an image file, a PIL Image, or a numpy array
            
        Returns:
            The detected text in the image
        """
        # Lazy-load the model on first use
        if not self.model_loaded:
            try:
                self._load_model()
            except Exception as e:
                logger.error(f"Failed to load model on first use: {str(e)}")
                return None
        
        # Check if model had a previous loading error
        if self.model_load_error:
            logger.error(f"Cannot perform OCR due to model loading error: {self.model_load_error}")
            return None
            
        try:
            # Handle different input types
            if isinstance(image_input, str):
                # Input is a file path
                if not os.path.exists(image_input):
                    logger.error(f"Image not found: {image_input}")
                    return None
                logger.info(f"Processing image from path: {image_input}")
                image = Image.open(image_input).convert("RGB")
            elif isinstance(image_input, Image.Image):
                # Input is already a PIL Image
                logger.info("Processing PIL Image directly")
                image = image_input.convert("RGB")
            elif isinstance(image_input, np.ndarray):
                # Input is a numpy array
                logger.info("Processing numpy array")
                image = Image.fromarray(image_input).convert("RGB")
            elif isinstance(image_input, bytes) or isinstance(image_input, BytesIO):
                # Input is bytes or BytesIO
                if isinstance(image_input, bytes):
                    image_input = BytesIO(image_input)
                logger.info("Processing image from bytes data")
                image = Image.open(image_input).convert("RGB")
            else:
                logger.error(f"Unsupported input type: {type(image_input)}")
                return None
            
            # Log image dimensions
            logger.info(f"Image dimensions: {image.width}x{image.height}")
            
            # Validate image
            is_valid, error_message = self.validate_image(image)
            if not is_valid:
                logger.warning(f"Image validation failed: {error_message}")
                return None
            
            # Process the image
            try:
                pixel_values = self.feature_extractor(images=image, return_tensors="pt").pixel_values.to(self.device)
            except Exception as e:
                logger.error(f"Error processing image with feature extractor: {str(e)}")
                return None
            
            # Generate text using the model
            logger.info("Generating text...")
            try:
                generated_ids = self.model.generate(pixel_values)
            except Exception as e:
                logger.error(f"Error generating text: {str(e)}")
                return None
            
            # Decode the generated ids to text
            try:
                generated_text = self.tokenizer.batch_decode(generated_ids, skip_special_tokens=True)[0]
            except Exception as e:
                logger.error(f"Error decoding text: {str(e)}")
                return None
                
            logger.info(f"Detected text: {generated_text}")
            
            # If the detected text is empty or just whitespace, return None
            if not generated_text or generated_text.strip() == "":
                logger.warning("OCR returned empty text")
                return None
                
            return generated_text
        except Exception as e:
            logger.error(f"Error during OCR processing: {str(e)}")
            return None

# Singleton pattern - create a global instance
_ocr_instance = None

def get_ocr_instance(model_name="kha-white/manga-ocr-base"):
    """Get a singleton instance of the MangaOCR class."""
    global _ocr_instance
    if _ocr_instance is None:
        _ocr_instance = MangaOCR(model_name)
    return _ocr_instance

def main():
    parser = argparse.ArgumentParser(description="Manga OCR")
    parser.add_argument("--image", type=str, default="test.png", help="Path to the image")
    args = parser.parse_args()
    
    try:
        ocr = MangaOCR()
        result = ocr(args.image)
        
        if result:
            print(f"Detected text: {result}")
        else:
            print("Failed to detect text")
    except Exception as e:
        logger.error(f"An error occurred: {str(e)}")

if __name__ == "__main__":
    main()
