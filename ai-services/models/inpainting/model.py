import cv2
import numpy as np
import torch


from models.inpainting.helper import norm_img, load_jit_model, pad_img_to_modulo

class AnimeLaMa:
    name = "anime-lama"
    pad_mod = 8
    
    def __init__(self, device="cuda"):
        self.device = device
        self.model = None
        self.init_model(device)
    
    def init_model(self, device):
        self.device = torch.device(device)
        self.model = load_jit_model(self.device).eval()
    
    def forward(self, image, mask):
        """
        Input image and output image have same size
        image: [H, W, C] RGB
        mask: [H, W]
        return: BGR IMAGE
        """
        # Ensure mask and image have the same dimensions
        if mask.shape[:2] != image.shape[:2]:
            mask = cv2.resize(mask, (image.shape[1], image.shape[0]), 
                             interpolation=cv2.INTER_NEAREST)
        
        # Pad image and mask to be divisible by pad_mod
        h, w = image.shape[:2]
        image = pad_img_to_modulo(image, self.pad_mod)
        mask = pad_img_to_modulo(mask, self.pad_mod)
        
        # Convert to tensor format
        image = norm_img(image)
        mask = norm_img(mask)

        mask = (mask > 0) * 1
        image = torch.from_numpy(image).unsqueeze(0).to(self.device)
        mask = torch.from_numpy(mask).unsqueeze(0).to(self.device)

        # Print shapes for debugging
        print(f"Image tensor shape: {image.shape}")
        print(f"Mask tensor shape: {mask.shape}")

        with torch.no_grad():
            inpainted_image = self.model(image, mask)

        cur_res = inpainted_image[0].permute(1, 2, 0).detach().cpu().numpy()
        cur_res = np.clip(cur_res * 255, 0, 255).astype("uint8")
        cur_res = cv2.cvtColor(cur_res, cv2.COLOR_RGB2BGR)
        
        # Crop back to original dimensions
        cur_res = cur_res[:h, :w]
        
        return cur_res
    
    def inpaint(self, image, mask):
        """Convenience method for inpainting"""
        return self.forward(image, mask) 