#!/usr/bin/env python3
import os
import sys
import argparse
import glob
from pathlib import Path

import cv2
import torch

from model import AnimeLaMa
from helper import prepare_image_mask, ensure_directory

def parse_args():
    parser = argparse.ArgumentParser(description="Anime-LaMa inpainting tool")
    parser.add_argument("--image", type=str, required=True, help="Path to image file or directory")
    parser.add_argument("--mask", type=str, required=True, help="Path to mask file or directory")
    parser.add_argument("--output", type=str, default="output", help="Output directory")
    parser.add_argument("--device", type=str, default="cuda", help="Device to use (cuda or cpu)")
    
    return parser.parse_args()

def process_single_image(model, image_path, mask_path, output_dir):
    # Get output filename
    filename = os.path.basename(image_path)
    output_path = os.path.join(output_dir, filename)
    
    # Load and prepare image and mask
    try:
        image, mask = prepare_image_mask(image_path, mask_path)
        
        # Run inpainting
        result = model.inpaint(image, mask)
        
        # Save result
        cv2.imwrite(output_path, result)
        print(f"Processed: {image_path} -> {output_path}")
        return True
    except Exception as e:
        print(f"Error processing {image_path}: {str(e)}")
        return False

def process_directory(model, image_dir, mask_dir, output_dir):
    # Find all images in the image directory
    image_extensions = ['*.jpg', '*.jpeg', '*.png', '*.bmp']
    image_paths = []
    for ext in image_extensions:
        image_paths.extend(glob.glob(os.path.join(image_dir, ext)))
        image_paths.extend(glob.glob(os.path.join(image_dir, ext.upper())))
    
    if not image_paths:
        print(f"No images found in {image_dir}")
        return
    
    # Process each image
    success_count = 0
    for image_path in image_paths:
        filename = os.path.basename(image_path)
        name_without_ext = os.path.splitext(filename)[0]
        
        # Look for matching mask with same name
        mask_candidates = [
            os.path.join(mask_dir, f"{name_without_ext}.jpg"),
            os.path.join(mask_dir, f"{name_without_ext}.jpeg"),
            os.path.join(mask_dir, f"{name_without_ext}.png"),
            os.path.join(mask_dir, f"{name_without_ext}.bmp")
        ]
        
        mask_path = None
        for candidate in mask_candidates:
            if os.path.exists(candidate):
                mask_path = candidate
                break
        
        if mask_path is None:
            print(f"No matching mask found for {image_path}")
            continue
        
        if process_single_image(model, image_path, mask_path, output_dir):
            success_count += 1
    
    print(f"Successfully processed {success_count} out of {len(image_paths)} images")

def main():
    args = parse_args()
    
    # Check CUDA availability if requested
    if args.device == "cuda" and not torch.cuda.is_available():
        print("CUDA requested but not available. Using CPU instead.")
        args.device = "cpu"
    
    # Initialize model
    print(f"Initializing Anime-LaMa model on {args.device}...")
    model = AnimeLaMa(device=args.device)
    
    # Ensure output directory exists
    ensure_directory(args.output)
    
    # Check if inputs are files or directories
    if os.path.isdir(args.image) and os.path.isdir(args.mask):
        # Process directories
        print(f"Processing directory: {args.image}")
        process_directory(model, args.image, args.mask, args.output)
    elif os.path.isfile(args.image) and os.path.isfile(args.mask):
        # Process single image
        print(f"Processing image: {args.image}")
        process_single_image(model, args.image, args.mask, args.output)
    else:
        print("Error: Both --image and --mask must be either files or directories")
        sys.exit(1)
    
    print(f"Done! Results saved to {args.output}")

if __name__ == "__main__":
    main() 