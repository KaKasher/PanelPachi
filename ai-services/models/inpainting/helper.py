import os
import torch
import numpy as np
import cv2

def norm_img(img):
    if isinstance(img, np.ndarray):
        if len(img.shape) == 2:
            img = img[:, :, np.newaxis]
        img = img.transpose(2, 0, 1)
        img = img.astype("float32") / 255.0
    return img

def get_model_path():
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "anime-manga-big-lama.pt")

def load_jit_model(device):
    model_path = get_model_path()
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Model file not found at {model_path}")
    
    with torch.no_grad():
        model = torch.jit.load(model_path, map_location=device)
    return model

def prepare_image_mask(image_path: str, mask_path: str):
    """Load and prepare image and mask for inpainting"""
    # Read image
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image not found: {image_path}")
    
    image = cv2.imread(image_path)
    if image is None:
        raise ValueError(f"Could not read image: {image_path}")
    image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    
    # Read mask
    if not os.path.exists(mask_path):
        raise FileNotFoundError(f"Mask not found: {mask_path}")
    
    mask = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
    if mask is None:
        raise ValueError(f"Could not read mask: {mask_path}")
    
    # Ensure mask has the same dimensions as the image
    if mask.shape[:2] != image.shape[:2]:
        print(f"Resizing mask from {mask.shape[:2]} to match image dimensions {image.shape[:2]}")
        mask = cv2.resize(mask, (image.shape[1], image.shape[0]), interpolation=cv2.INTER_NEAREST)
    
    return image, mask

def pad_img_to_modulo(img, mod_pad):
    """Pad image to be divisible by mod_pad"""
    if len(img.shape) == 3:
        h, w, _ = img.shape
    else:
        h, w = img.shape
        
    bottom = (mod_pad - h % mod_pad) % mod_pad
    right = (mod_pad - w % mod_pad) % mod_pad
    
    if len(img.shape) == 3:
        return cv2.copyMakeBorder(img, 0, bottom, 0, right, 
                                  cv2.BORDER_REFLECT)
    else:
        return cv2.copyMakeBorder(img, 0, bottom, 0, right, 
                                  cv2.BORDER_REFLECT)

def ensure_directory(directory):
    """Ensure the output directory exists"""
    if not os.path.exists(directory):
        os.makedirs(directory) 