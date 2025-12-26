import os
import sys
import requests
from openai import OpenAI
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file if it exists
load_dotenv()

def generate_image(prompt, output_path, model="dall-e-3", size="1024x1024", quality="standard", style="vivid"):
    """
    Generates an image using OpenAI's DALL-E and saves it to the specified path.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("Error: OPENAI_API_KEY environment variable not set.")
        sys.exit(1)

    client = OpenAI(api_key=api_key)

    print(f"Generating image (quality={quality}, style={style}) for prompt: {prompt}")
    try:
        response = client.images.generate(
            model=model,
            prompt=prompt,
            size=size,
            quality=quality,
            style=style,
            n=1,
        )

        image_url = response.data[0].url
        print(f"Image generated. Downloading from: {image_url}")

        # Download the image
        img_data = requests.get(image_url).content

        # Ensure the directory exists
        output_file = Path(output_path)
        output_file.parent.mkdir(parents=True, exist_ok=True)

        with open(output_file, 'wb') as handler:
            handler.write(img_data)

        print(f"Image successfully saved to: {output_path}")

    except Exception as e:
        print(f"An error occurred: {e}")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python generate_image.py \"<prompt>\" \"<output_path>\" [quality] [size] [style]")
        sys.exit(1)

    prompt_arg = sys.argv[1]
    path_arg = sys.argv[2]
    quality_arg = sys.argv[3] if len(sys.argv) > 3 else "standard"
    size_arg = sys.argv[4] if len(sys.argv) > 4 else "1024x1024"
    style_arg = sys.argv[5] if len(sys.argv) > 5 else "vivid"

    generate_image(prompt_arg, path_arg, quality=quality_arg, size=size_arg, style=style_arg)
