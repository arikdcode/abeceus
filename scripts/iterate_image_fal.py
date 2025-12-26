import os
import sys
import fal_client
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file if it exists
load_dotenv()

def iterate_image_fal(image_path, prompt, output_path, strength=0.5, model="fal-ai/flux-pro"):
    """
    Iterates on an existing image using Flux.1 [pro] via Fal.ai (img2img).
    """
    api_key = os.getenv("FAL_KEY")
    if not api_key:
        print("Error: FAL_KEY environment variable not set in .env.")
        sys.exit(1)

    os.environ["FAL_KEY"] = api_key

    print(f"Uploading base image: {image_path}")
    try:
        image_url = fal_client.upload_file(image_path)
        print(f"Image uploaded. URL: {image_url}")
    except Exception as e:
        print(f"Error uploading image: {e}")
        sys.exit(1)

    print(f"Iterating on image (strength={strength}) with prompt: {prompt}")

    try:
        handler = fal_client.submit(
            model,
            arguments={
                "prompt": prompt,
                "image_url": image_url,
                "image_strength": strength, # Range 0.0 to 1.0
                "image_size": "square_hd",
                "num_inference_steps": 28,
                "guidance_scale": 3.5,
                "num_images": 1,
                "enable_safety_checker": False
            },
        )

        result = handler.get()

        if not result or "images" not in result or not result["images"]:
            print(f"Error: No image was generated. Result: {result}")
            sys.exit(1)

        image_url = result["images"][0]["url"]
        print(f"Iteration generated. Downloading from: {image_url}")

        import requests
        img_data = requests.get(image_url).content

        output_file = Path(output_path)
        output_file.parent.mkdir(parents=True, exist_ok=True)

        with open(output_file, 'wb') as handler:
            handler.write(img_data)

        print(f"Iterated image successfully saved to: {output_path}")

    except Exception as e:
        print(f"An error occurred: {e}")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python scripts/iterate_image_fal.py \"<image_path>\" \"<prompt>\" \"<output_path>\" [strength]")
        sys.exit(1)

    image_path_arg = sys.argv[1]
    prompt_arg = sys.argv[2]
    output_path_arg = sys.argv[3]
    strength_arg = float(sys.argv[4]) if len(sys.argv) > 4 else 0.5

    iterate_image_fal(image_path_arg, prompt_arg, output_path_arg, strength=strength_arg)
