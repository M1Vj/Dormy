from PIL import Image, ImageDraw

def create_rounded_icon():
    try:
        # Open the image
        img = Image.open('public/brand/dormy-house.png').convert("RGBA")
        
        # Dimensions
        w, h = img.size
        
        # Create a completely transparent image for the mask
        mask = Image.new('L', (w, h), 0)
        draw = ImageDraw.Draw(mask)
        
        # Draw a white circle on the mask
        # To make it perfectly round, we use the minimum dimension
        diameter = min(w, h)
        offset_x = (w - diameter) // 2
        offset_y = (h - diameter) // 2
        
        draw.ellipse((offset_x, offset_y, offset_x + diameter, offset_y + diameter), fill=255)
        
        # Apply the mask to the image
        rounded_img = img.copy()
        rounded_img.putalpha(mask)
        
        # Save as PNG to preserve transparency
        output_path = 'public/brand/dormy-house-rounded-icon.png'
        rounded_img.save(output_path, 'PNG')
        print(f"Successfully saved rounded transparent icon to {output_path}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    create_rounded_icon()
