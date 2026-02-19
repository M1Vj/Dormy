from PIL import Image, ImageDraw

def create_rounded_corners_icon(radius_percentage=0.2):
    try:
        # Open the image
        img = Image.open('public/brand/dormy-house.png').convert("RGBA")
        
        # Dimensions
        w, h = img.size
        
        # Calculate the absolute radius
        radius = int(min(w, h) * radius_percentage)
        
        # Create a completely transparent image for the mask
        mask = Image.new('L', (w, h), 0)
        draw = ImageDraw.Draw(mask)
        
        # Draw a white rounded rectangle on the mask
        draw.rounded_rectangle((0, 0, w, h), radius=radius, fill=255)
        
        # Apply the mask to the image
        rounded_img = img.copy()
        rounded_img.putalpha(mask)
        
        # Save as PNG to preserve transparency
        output_path = 'public/brand/dormy-house-rounded-corners.png'
        rounded_img.save(output_path, 'PNG')
        print(f"Successfully saved rounded transparent icon to {output_path}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    create_rounded_corners_icon()
