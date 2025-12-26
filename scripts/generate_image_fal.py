import os
import sys
import fal_client
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file if it exists
load_dotenv()

def generate_image_fal(prompt, output_path, model="fal-ai/flux-pro"):
    """
    Generates an image using Flux.1 [pro] via Fal.ai and saves it to the specified path.
    """
    api_key = os.getenv("FAL_KEY")
    if not api_key:
        print("Error: FAL_KEY environment variable not set in .env.")
        sys.exit(1)

    # The fal-client uses the FAL_KEY environment variable automatically
    os.environ["FAL_KEY"] = api_key

    print(f"Generating image (Flux.1 [pro] via Fal) for prompt: {prompt}")

    try:
        # Flux.1 [pro] parameters
        handler = fal_client.submit(
            model,
            arguments={
                "prompt": prompt,
                "image_size": "square_hd", # or "landscape_16_9"
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
        print(f"Image generated. Downloading from: {image_url}")

        # Download the image using fal_client's built-in download or requests
        import requests
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
        print("Usage: python generate_image_fal.py \"<prompt>\" \"<output_path>\"")
        sys.exit(1)

    prompt_arg = sys.argv[1]
    path_arg = sys.argv[2]

    generate_image_fal(prompt_arg, path_arg)
