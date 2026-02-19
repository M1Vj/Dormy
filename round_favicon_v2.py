import cv2
import numpy as np

# Load image
img = cv2.imread('public/brand/dormy-house.png', cv2.IMREAD_UNCHANGED)

# Ensure image has an alpha channel
if img.shape[2] == 3:
    img = cv2.cvtColor(img, cv2.COLOR_BGR2BGRA)

# Get image dimensions
h, w = img.shape[:2]

# Create a full transparent image to act as the destination
output = np.zeros((h, w, 4), dtype=np.uint8)

# Center and radius for the circle
center = (int(w / 2), int(h / 2))
radius = min(center[0], center[1])

# Create a mask for the circle (white circle on black background)
mask = np.zeros((h, w), dtype=np.uint8)
cv2.circle(mask, center, radius, 255, -1)

# Apply the mask: wherever mask is 255, copy from img to output
# The rest of output remains transparent (alpha = 0)
output[mask == 255] = img[mask == 255]

# Save the rounded image
cv2.imwrite('public/brand/dormy-house-rounded-icon.png', output)
print("Saved transparent rounded image to public/brand/dormy-house-rounded-icon.png")
