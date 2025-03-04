#!/usr/bin/env python3
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
        # Get original image format
        img_path = Path(args.image)
        input_ext = img_path.suffix.lower()
        print(f"Input image format: {input_ext}")
        
        # Determine output format
        output_path = Path(args.output)
        if not output_path.suffix:
            # If no extension specified, use the input format or default to png
            output_ext = input_ext if input_ext else '.png'
            output_path = output_path.with_suffix(output_ext)
            args.output = str(output_path)
            print(f"Updated output path with extension: {args.output}")
        
        image, mask = prepare_image_mask(args.image, args.mask)
        print(f"Image shape: {image.shape}, Mask shape: {mask.shape}")
        
        # Run inpainting
        result = model.inpaint(image, mask)
        print(f"Inpainting result shape: {result.shape}")
        
        # Ensure output directory exists
        output_dir = os.path.dirname(args.output)
        if output_dir:  # Ensure we don't try to create an empty directory
            ensure_directory(output_dir)
        
        # Save result
        cv2.imwrite(args.output, result)
        print(f"Processed: {args.image} -> {args.output}")
        
        # Verify the output file was created
        if os.path.exists(args.output):
            print(f"Output file exists, size: {os.path.getsize(args.output)} bytes")
        else:
            print(f"Warning: Output file {args.output} was not created!")
            
        return 0
    except Exception as e:
        import traceback
        print(f"Error processing image: {str(e)}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return 1

if __name__ == "__main__":
    sys.exit(main()) 